import { Hono } from 'hono'
import { db } from '../lib/db'
import { authMiddleware } from '../lib/auth'
import { calcBalances, multilateralNetting, bilateralNetting, type Flow } from '../lib/netting'

const settlements = new Hono()
settlements.use('*', authMiddleware)

/** グループの精算履歴一覧 */
settlements.get('/groups/:groupId', async (c) => {
  const { groupId } = c.req.param()

  // 精算一覧を取得
  const { data: settlementRows, error: sErr } = await db
    .from('settlements')
    .select('id, method, created_at, executed_by')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })

  if (sErr) return c.json({ error: 'DB error' }, 500)
  if (!settlementRows || settlementRows.length === 0) return c.json([])

  const settlementIds = settlementRows.map((s: { id: string }) => s.id)

  // 精算結果を取得
  const { data: resultRows } = await db
    .from('settlement_results')
    .select('settlement_id, from_user_id, to_user_id, amount')
    .in('settlement_id', settlementIds)

  // 含まれた支払いを取得
  const { data: spRows } = await db
    .from('settlement_payments')
    .select('settlement_id, payment_id')
    .in('settlement_id', settlementIds)

  const paymentIds = (spRows ?? []).map((sp: { payment_id: string }) => sp.payment_id)

  const { data: paymentRows } = paymentIds.length > 0
    ? await db.from('payments').select('id, description, amount, created_at, payer_id').in('id', paymentIds)
    : { data: [] }

  // ユーザー情報をまとめて取得
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

  // 組み立て
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
        return {
          payments: {
            ...p,
            payer: userMap.get(p.payer_id) ?? null,
          },
        }
      })
      .filter(Boolean),
  }))

  return c.json(result)
})

/** 自分が支払う必要のある結果一覧 */
settlements.get('/groups/:groupId/my-tasks', async (c) => {
  const { groupId } = c.req.param()
  const user = c.get('user')

  // グループの精算ID一覧
  const { data: settlementRows, error: sErr } = await db
    .from('settlements')
    .select('id, created_at, method')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })

  if (sErr) return c.json({ error: 'DB error' }, 500)
  if (!settlementRows || settlementRows.length === 0) return c.json([])

  const settlementIds = settlementRows.map((s: { id: string }) => s.id)

  // 自分が from_user_id の結果のみ取得
  const { data: resultRows, error: rErr } = await db
    .from('settlement_results')
    .select('id, settlement_id, to_user_id, amount, paid')
    .in('settlement_id', settlementIds)
    .eq('from_user_id', user.id)

  if (rErr) return c.json({ error: 'DB error' }, 500)
  if (!resultRows || resultRows.length === 0) return c.json([])

  const toUserIds = [...new Set(resultRows.map((r: { to_user_id: string }) => r.to_user_id))]
  const { data: userRows } = await db
    .from('users')
    .select('id, display_name, picture_url')
    .in('id', toUserIds)

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

/** 支払いタスクの完了状態を更新（クエリパラメータで受け取る） */
settlements.patch('/results/:resultId/paid', async (c) => {
  const { resultId } = c.req.param()
  const user = c.get('user')
  const paid = c.req.query('paid') === 'true'

  // 本人確認
  const { data: result, error: fetchError } = await db
    .from('settlement_results')
    .select('from_user_id')
    .eq('id', resultId)
    .single()

  if (fetchError || !result) return c.json({ error: 'Not found' }, 404)
  if (result.from_user_id !== user.id) return c.json({ error: 'Forbidden' }, 403)

  const { error } = await db
    .from('settlement_results')
    .update({ paid })
    .eq('id', resultId)

  if (error) return c.json({ error: 'DB error' }, 500)
  return c.json({ ok: true })
})

/** 精算を実行（クエリパラメータで受け取る） */
settlements.post('/', async (c) => {
  const user = c.get('user')
  const group_id = c.req.query('group_id') ?? ''
  const method   = (c.req.query('method') ?? 'multilateral') as 'multilateral' | 'bilateral'
  if (!group_id) return c.json({ error: 'group_id is required' }, 400)

  // 承認済み・未精算の payments を取得
  const { data: rawPayments, error: fetchError } = await db
    .from('payments')
    .select('id, payer_id, amount, payment_splits(user_id, amount)')
    .eq('group_id', group_id)
    .eq('status', 'approved')
    .eq('settled', false)

  if (fetchError) return c.json({ error: 'DB error' }, 500)
  if (!rawPayments || rawPayments.length === 0) {
    return c.json({ error: 'No approved payments to settle' }, 400)
  }

  const payments = rawPayments as Array<{
    id: string
    payer_id: string
    amount: number
    payment_splits: Array<{ user_id: string; amount: number }>
  }>

  // Netting 計算
  let nettingResults: Flow[]

  if (method === 'multilateral') {
    const balances = calcBalances(
      payments.map((p) => ({ payer_id: p.payer_id, splits: p.payment_splits }))
    )
    nettingResults = multilateralNetting(balances)
  } else {
    // bilateral: 個々のflowをそのまま渡して相殺
    const flows: Flow[] = []
    for (const p of payments) {
      for (const split of p.payment_splits) {
        if (split.user_id === p.payer_id) continue
        flows.push({ from: split.user_id, to: p.payer_id, amount: split.amount })
      }
    }
    nettingResults = bilateralNetting(flows)
  }

  // DB に保存（各ステップのエラーを検出して整合性を保つ）
  const { data: settlement, error: settlementError } = await db
    .from('settlements')
    .insert({ group_id, method, executed_by: user.id })
    .select()
    .single()

  if (settlementError || !settlement) return c.json({ error: 'Failed to create settlement' }, 500)

  // settlement_payments
  const { error: spError } = await db.from('settlement_payments').insert(
    payments.map((p) => ({ settlement_id: settlement.id, payment_id: p.id }))
  )
  if (spError) {
    await db.from('settlements').delete().eq('id', settlement.id)
    return c.json({ error: 'Failed to create settlement_payments' }, 500)
  }

  // settlement_results
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
      return c.json({ error: 'Failed to create settlement_results' }, 500)
    }
  }

  // payments を settled = true に更新
  const { error: updateError } = await db
    .from('payments')
    .update({ settled: true, updated_at: new Date().toISOString() })
    .in('id', payments.map((p) => p.id))

  if (updateError) {
    await db.from('settlements').delete().eq('id', settlement.id)
    return c.json({ error: 'Failed to mark payments as settled' }, 500)
  }

  // レスポンス: 結果を返す
  const { data: resultsWithUsers } = await db
    .from('settlement_results')
    .select(`
      amount,
      from_user:users!from_user_id(id, display_name, picture_url),
      to_user:users!to_user_id(id, display_name, picture_url)
    `)
    .eq('settlement_id', settlement.id)

  return c.json({ ...settlement, results: resultsWithUsers ?? [] }, 201)
})

export default settlements
