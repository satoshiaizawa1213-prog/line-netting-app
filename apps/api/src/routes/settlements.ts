import { Hono } from 'hono'
import { db } from '../lib/db'
import { authMiddleware } from '../lib/auth'
import { calcBalances, multilateralNetting, bilateralNetting, type Flow } from '../lib/netting'
import { pushLineMessages } from '../lib/line-notify'

const settlements = new Hono()
settlements.use('*', authMiddleware)

// ─── 精算実行ロジック（提案承認時・直接実行時で共有） ───────────
async function executeSettlement(
  group_id: string,
  method: 'multilateral' | 'bilateral',
  executed_by: string
): Promise<{ ok: true; settlement: Record<string, unknown>; results: unknown[] } | { ok: false; error: string }> {
  const { data: rawPayments, error: fetchError } = await db
    .from('payments')
    .select('id, payer_id, amount, payment_splits(user_id, amount)')
    .eq('group_id', group_id)
    .eq('status', 'approved')
    .eq('settled', false)

  if (fetchError) return { ok: false, error: 'DB error' }
  if (!rawPayments || rawPayments.length === 0) return { ok: false, error: 'No approved payments to settle' }

  const payments = rawPayments as Array<{
    id: string
    payer_id: string
    amount: number
    payment_splits: Array<{ user_id: string; amount: number }>
  }>

  let nettingResults: Flow[]
  if (method === 'multilateral') {
    const balances = calcBalances(payments.map((p) => ({ payer_id: p.payer_id, splits: p.payment_splits })))
    nettingResults = multilateralNetting(balances)
  } else {
    const flows: Flow[] = []
    for (const p of payments) {
      for (const split of p.payment_splits) {
        if (split.user_id === p.payer_id) continue
        flows.push({ from: split.user_id, to: p.payer_id, amount: split.amount })
      }
    }
    nettingResults = bilateralNetting(flows)
  }

  const { data: settlement, error: settlementError } = await db
    .from('settlements')
    .insert({ group_id, method, executed_by })
    .select()
    .single()
  if (settlementError || !settlement) return { ok: false, error: 'Failed to create settlement' }

  const { error: spError } = await db.from('settlement_payments').insert(
    payments.map((p) => ({ settlement_id: settlement.id, payment_id: p.id }))
  )
  if (spError) {
    await db.from('settlements').delete().eq('id', settlement.id)
    return { ok: false, error: 'Failed to create settlement_payments' }
  }

  if (nettingResults.length > 0) {
    const { error: srError } = await db.from('settlement_results').insert(
      nettingResults.map((r) => ({
        settlement_id: settlement.id,
        from_user_id: r.from,
        to_user_id: r.to,
        amount: r.amount,
      }))
    )
    if (srError) {
      await db.from('settlements').delete().eq('id', settlement.id)
      return { ok: false, error: 'Failed to create settlement_results' }
    }
  }

  const { error: updateError } = await db
    .from('payments')
    .update({ settled: true, updated_at: new Date().toISOString() })
    .in('id', payments.map((p) => p.id))
  if (updateError) {
    await db.from('settlements').delete().eq('id', settlement.id)
    return { ok: false, error: 'Failed to mark payments as settled' }
  }

  const { data: resultsWithUsers } = await db
    .from('settlement_results')
    .select('amount, from_user:users!from_user_id(id, display_name, picture_url), to_user:users!to_user_id(id, display_name, picture_url)')
    .eq('settlement_id', settlement.id)

  return { ok: true, settlement, results: resultsWithUsers ?? [] }
}

// ─── 精算提案一覧 ────────────────────────────────────────────
settlements.get('/proposals', async (c) => {
  const group_id = c.req.query('group_id') ?? ''
  const user = c.get('user')
  if (!group_id) return c.json({ error: 'group_id is required' }, 400)

  // メンバーシップ確認
  const { data: memberCheck } = await db
    .from('group_members').select('user_id').eq('group_id', group_id).eq('user_id', user.id).eq('is_active', true).maybeSingle()
  if (!memberCheck) return c.json({ error: 'Forbidden' }, 403)

  const { data: proposals, error } = await db
    .from('settlement_proposals')
    .select('id, method, proposed_by, status, created_at')
    .eq('group_id', group_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) return c.json({ error: 'DB error' }, 500)
  if (!proposals || proposals.length === 0) return c.json([])

  const proposalIds = proposals.map((p: { id: string }) => p.id)

  // 投票情報
  const { data: voteRows } = await db
    .from('settlement_proposal_votes')
    .select('proposal_id, user_id')
    .in('proposal_id', proposalIds)

  // 提案者情報
  const proposerIds = [...new Set(proposals.map((p: { proposed_by: string }) => p.proposed_by))]
  const { data: userRows } = await db.from('users').select('id, display_name').in('id', proposerIds)
  const userMap = new Map((userRows ?? []).map((u: { id: string; display_name: string }) => [u.id, u]))

  // アクティブメンバー数
  const { data: members } = await db
    .from('group_members').select('user_id').eq('group_id', group_id).eq('is_active', true)
  const totalMembers = (members ?? []).length

  const result = proposals.map((p: { id: string; method: string; proposed_by: string; status: string; created_at: string }) => {
    const votes = (voteRows ?? []).filter((v: { proposal_id: string }) => v.proposal_id === p.id)
    return {
      ...p,
      proposed_by_user: userMap.get(p.proposed_by) ?? null,
      vote_count: votes.length,
      total_members: totalMembers,
      my_vote: votes.some((v: { user_id: string }) => v.user_id === user.id),
    }
  })

  return c.json(result)
})

// ─── 精算を提案 ──────────────────────────────────────────────
settlements.post('/proposals', async (c) => {
  const user = c.get('user')
  const group_id = c.req.query('group_id') ?? ''
  const method = (c.req.query('method') ?? 'multilateral') as 'multilateral' | 'bilateral'
  if (!group_id) return c.json({ error: 'group_id is required' }, 400)

  // メンバーシップ確認
  const { data: memberCheck } = await db
    .from('group_members').select('user_id').eq('group_id', group_id).eq('user_id', user.id).eq('is_active', true).maybeSingle()
  if (!memberCheck) return c.json({ error: 'Forbidden' }, 403)

  // 既存の pending 提案チェック
  const { data: existing } = await db
    .from('settlement_proposals').select('id').eq('group_id', group_id).eq('status', 'pending').maybeSingle()
  if (existing) return c.json({ error: 'Already has a pending proposal' }, 400)

  // 精算対象の支払いがあるか確認
  const { data: approvedPayments } = await db
    .from('payments').select('id').eq('group_id', group_id).eq('status', 'approved').eq('settled', false)
  if (!approvedPayments || approvedPayments.length === 0) {
    return c.json({ error: 'No approved payments to settle' }, 400)
  }

  // 提案作成
  const { data: proposal, error } = await db
    .from('settlement_proposals')
    .insert({ group_id, method, proposed_by: user.id })
    .select().single()
  if (error || !proposal) return c.json({ error: 'Failed to create proposal' }, 500)

  // 提案者の票を自動追加
  await db.from('settlement_proposal_votes').insert({ proposal_id: proposal.id, user_id: user.id })

  // アクティブメンバー全員に通知
  const { data: members } = await db
    .from('group_members').select('user_id').eq('group_id', group_id).eq('is_active', true)
  const otherIds = (members ?? []).map((m: { user_id: string }) => m.user_id).filter((id: string) => id !== user.id)
  if (otherIds.length > 0) {
    const { data: recipients } = await db.from('users').select('line_user_id').in('id', otherIds)
    const liffUrl = process.env.LIFF_URL ?? ''
    await pushLineMessages(
      recipients ?? [],
      `💰 ${user.display_name}さんが精算を提案しました。\n全員の承認が揃うと精算が実行されます。\n${liffUrl}`
    )
  }

  return c.json({ ...proposal, vote_count: 1, total_members: (members ?? []).length, my_vote: true }, 201)
})

// ─── 提案を承認 ──────────────────────────────────────────────
settlements.post('/proposals/:proposalId/approve', async (c) => {
  const { proposalId } = c.req.param()
  const user = c.get('user')

  // 提案を取得
  const { data: proposal, error: pErr } = await db
    .from('settlement_proposals').select('id, group_id, method, status, proposed_by').eq('id', proposalId).maybeSingle()
  if (pErr || !proposal) return c.json({ error: 'Proposal not found' }, 404)
  if (proposal.status !== 'pending') return c.json({ error: 'Proposal is no longer pending' }, 400)

  // メンバーシップ確認
  const { data: memberCheck } = await db
    .from('group_members').select('user_id').eq('group_id', proposal.group_id).eq('user_id', user.id).eq('is_active', true).maybeSingle()
  if (!memberCheck) return c.json({ error: 'Forbidden' }, 403)

  // 既に投票済みか
  const { data: existingVote } = await db
    .from('settlement_proposal_votes').select('user_id').eq('proposal_id', proposalId).eq('user_id', user.id).maybeSingle()
  if (existingVote) return c.json({ error: 'Already voted' }, 400)

  // 投票追加
  const { error: vErr } = await db.from('settlement_proposal_votes').insert({ proposal_id: proposalId, user_id: user.id })
  if (vErr) return c.json({ error: 'Failed to record vote' }, 500)

  // 全票揃ったか確認
  const { data: members } = await db
    .from('group_members').select('user_id').eq('group_id', proposal.group_id).eq('is_active', true)
  const { data: votes } = await db
    .from('settlement_proposal_votes').select('user_id').eq('proposal_id', proposalId)

  const totalMembers = (members ?? []).length
  const voteCount = (votes ?? []).length

  if (voteCount < totalMembers) {
    // まだ全員揃っていない
    return c.json({ status: 'waiting', vote_count: voteCount, total_members: totalMembers })
  }

  // 全員承認 → 精算実行
  const execResult = await executeSettlement(proposal.group_id, proposal.method, user.id)
  if (!execResult.ok) {
    return c.json({ error: execResult.error }, 500)
  }

  // 提案を executed に更新
  await db.from('settlement_proposals').update({ status: 'executed' }).eq('id', proposalId)

  // 全メンバーに精算結果を通知
  const { data: allMembers } = await db
    .from('group_members').select('user_id').eq('group_id', proposal.group_id).eq('is_active', true)
  const allIds = (allMembers ?? []).map((m: { user_id: string }) => m.user_id)
  const { data: recipients } = await db.from('users').select('line_user_id').in('id', allIds)

  const results = execResult.results as Array<{
    amount: number
    from_user?: { display_name: string }
    to_user?: { display_name: string }
  }>

  let notifyText = '✅ 精算が完了しました！\n\n'
  if (results.length === 0) {
    notifyText += '支払いはありません（精算済み）。'
  } else {
    notifyText += results.map((r) =>
      `${r.from_user?.display_name ?? '?'} → ${r.to_user?.display_name ?? '?'}: ¥${r.amount.toLocaleString()}`
    ).join('\n')
  }

  const liffUrl = process.env.LIFF_URL ?? ''
  if (liffUrl) notifyText += `\n\n${liffUrl}`

  await pushLineMessages(recipients ?? [], notifyText)

  return c.json({ status: 'executed', settlement: execResult.settlement, results: execResult.results })
})

// ─── 提案をキャンセル（提案者のみ） ──────────────────────────
settlements.post('/proposals/:proposalId/cancel', async (c) => {
  const { proposalId } = c.req.param()
  const user = c.get('user')

  const { data: proposal } = await db
    .from('settlement_proposals').select('proposed_by, status').eq('id', proposalId).maybeSingle()
  if (!proposal) return c.json({ error: 'Proposal not found' }, 404)
  if (proposal.status !== 'pending') return c.json({ error: 'Proposal is no longer pending' }, 400)
  if (proposal.proposed_by !== user.id) return c.json({ error: 'Only proposer can cancel' }, 403)

  await db.from('settlement_proposals').update({ status: 'cancelled' }).eq('id', proposalId)
  return c.json({ ok: true })
})

// ─── 精算履歴一覧 ────────────────────────────────────────────
settlements.get('/groups/:groupId', async (c) => {
  const { groupId } = c.req.param()

  const { data: settlementRows, error: sErr } = await db
    .from('settlements')
    .select('id, method, created_at, executed_by')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })

  if (sErr) return c.json({ error: 'DB error' }, 500)
  if (!settlementRows || settlementRows.length === 0) return c.json([])

  const settlementIds = settlementRows.map((s: { id: string }) => s.id)

  const { data: resultRows } = await db
    .from('settlement_results')
    .select('settlement_id, from_user_id, to_user_id, amount')
    .in('settlement_id', settlementIds)

  const { data: spRows } = await db
    .from('settlement_payments')
    .select('settlement_id, payment_id')
    .in('settlement_id', settlementIds)

  const paymentIds = (spRows ?? []).map((sp: { payment_id: string }) => sp.payment_id)

  const { data: paymentRows } = paymentIds.length > 0
    ? await db.from('payments').select('id, description, amount, created_at, payer_id').in('id', paymentIds)
    : { data: [] }

  const allUserIds = new Set<string>()
  ;(resultRows ?? []).forEach((r: { from_user_id: string; to_user_id: string }) => {
    allUserIds.add(r.from_user_id)
    allUserIds.add(r.to_user_id)
  })
  ;(paymentRows ?? []).forEach((p: { payer_id: string }) => allUserIds.add(p.payer_id))
  settlementRows.forEach((s: { executed_by: string }) => allUserIds.add(s.executed_by))

  const { data: userRows } = allUserIds.size > 0
    ? await db.from('users').select('id, display_name').in('id', [...allUserIds])
    : { data: [] }

  const userMap = new Map((userRows ?? []).map((u: { id: string; display_name: string }) => [u.id, u]))

  const result = settlementRows.map((s: { id: string; method: string; created_at: string; executed_by: string }) => ({
    ...s,
    results: (resultRows ?? [])
      .filter((r: { settlement_id: string }) => r.settlement_id === s.id)
      .map((r: { from_user_id: string; to_user_id: string; amount: number }) => ({
        from_user_id: r.from_user_id,
        to_user_id:   r.to_user_id,
        amount:       r.amount,
        from_user:    userMap.get(r.from_user_id) ?? null,
        to_user:      userMap.get(r.to_user_id)   ?? null,
      })),
    settlement_payments: (spRows ?? [])
      .filter((sp: { settlement_id: string }) => sp.settlement_id === s.id)
      .map((sp: { payment_id: string }) => {
        const p = (paymentRows ?? []).find((pay: { id: string }) => pay.id === sp.payment_id)
        if (!p) return null
        return { payments: { ...p, payer: userMap.get(p.payer_id) ?? null } }
      })
      .filter(Boolean),
  }))

  return c.json(result)
})

// ─── 自分の支払いタスク ──────────────────────────────────────
settlements.get('/groups/:groupId/my-tasks', async (c) => {
  const { groupId } = c.req.param()
  const user = c.get('user')

  const { data: settlementRows, error: sErr } = await db
    .from('settlements')
    .select('id, created_at, method')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })

  if (sErr) return c.json({ error: 'DB error' }, 500)
  if (!settlementRows || settlementRows.length === 0) return c.json([])

  const settlementIds = settlementRows.map((s: { id: string }) => s.id)

  const { data: resultRows, error: rErr } = await db
    .from('settlement_results')
    .select('id, settlement_id, to_user_id, amount, paid')
    .in('settlement_id', settlementIds)
    .eq('from_user_id', user.id)

  if (rErr) return c.json({ error: 'DB error' }, 500)
  if (!resultRows || resultRows.length === 0) return c.json([])

  const toUserIds = [...new Set(resultRows.map((r: { to_user_id: string }) => r.to_user_id))]
  const { data: userRows } = await db.from('users').select('id, display_name, picture_url').in('id', toUserIds)

  const userMap = new Map((userRows ?? []).map((u: { id: string }) => [u.id, u]))
  const settlementMap = new Map(settlementRows.map((s: { id: string; created_at: string; method: string }) => [s.id, s]))

  const result = resultRows.map((r: { id: string; settlement_id: string; to_user_id: string; amount: number; paid: boolean }) => ({
    id:         r.id,
    amount:     r.amount,
    paid:       r.paid,
    to_user:    userMap.get(r.to_user_id) ?? null,
    settlement: settlementMap.get(r.settlement_id) ?? null,
  }))

  return c.json(result)
})

// ─── 支払いタスクの完了状態を更新 ────────────────────────────
settlements.patch('/results/:resultId/paid', async (c) => {
  const { resultId } = c.req.param()
  const user = c.get('user')
  const paid = c.req.query('paid') === 'true'

  const { data: result, error: fetchError } = await db
    .from('settlement_results').select('from_user_id').eq('id', resultId).single()
  if (fetchError || !result) return c.json({ error: 'Not found' }, 404)
  if (result.from_user_id !== user.id) return c.json({ error: 'Forbidden' }, 403)

  const { error } = await db.from('settlement_results').update({ paid }).eq('id', resultId)
  if (error) return c.json({ error: 'DB error' }, 500)
  return c.json({ ok: true })
})

// ─── 自分の受け取りタスク ────────────────────────────────────
settlements.get('/groups/:groupId/my-receive-tasks', async (c) => {
  const { groupId } = c.req.param()
  const user = c.get('user')

  const { data: settlementRows, error: sErr } = await db
    .from('settlements')
    .select('id, created_at, method')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })

  if (sErr) return c.json({ error: 'DB error' }, 500)
  if (!settlementRows || settlementRows.length === 0) return c.json([])

  const settlementIds = settlementRows.map((s: { id: string }) => s.id)

  const { data: resultRows, error: rErr } = await db
    .from('settlement_results')
    .select('id, settlement_id, from_user_id, amount, received')
    .in('settlement_id', settlementIds)
    .eq('to_user_id', user.id)

  if (rErr) return c.json({ error: 'DB error' }, 500)
  if (!resultRows || resultRows.length === 0) return c.json([])

  const fromUserIds = [...new Set(resultRows.map((r: { from_user_id: string }) => r.from_user_id))]
  const { data: userRows } = await db.from('users').select('id, display_name, picture_url').in('id', fromUserIds)

  const userMap = new Map((userRows ?? []).map((u: { id: string }) => [u.id, u]))
  const settlementMap = new Map(settlementRows.map((s: { id: string; created_at: string; method: string }) => [s.id, s]))

  const result = resultRows.map((r: { id: string; settlement_id: string; from_user_id: string; amount: number; received: boolean }) => ({
    id:         r.id,
    amount:     r.amount,
    received:   r.received,
    from_user:  userMap.get(r.from_user_id) ?? null,
    settlement: settlementMap.get(r.settlement_id) ?? null,
  }))

  return c.json(result)
})

// ─── 受け取りタスクの受取済み状態を更新 ──────────────────────
settlements.patch('/results/:resultId/received', async (c) => {
  const { resultId } = c.req.param()
  const user = c.get('user')
  const received = c.req.query('received') === 'true'

  const { data: result, error: fetchError } = await db
    .from('settlement_results').select('to_user_id').eq('id', resultId).single()
  if (fetchError || !result) return c.json({ error: 'Not found' }, 404)
  if (result.to_user_id !== user.id) return c.json({ error: 'Forbidden' }, 403)

  const { error } = await db.from('settlement_results').update({ received }).eq('id', resultId)
  if (error) return c.json({ error: 'DB error' }, 500)
  return c.json({ ok: true })
})

export default settlements
