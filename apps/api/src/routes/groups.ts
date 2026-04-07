import { Hono } from 'hono'
import { db } from '../lib/db'
import { authMiddleware } from '../lib/auth'
import { calcBalances } from '../lib/netting'

const groups = new Hono()
groups.use('*', authMiddleware)

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`TIMEOUT:${label} (${ms}ms)`)), ms)
    ),
  ])
}

/** グループ登録 or 取得（LINEグループIDで一意） */
groups.post('/', async (c) => {
  const { line_group_id, name } = await c.req.json<{ line_group_id: string; name?: string }>()
  const user = c.get('user')
  const t0 = Date.now()

  // 既存グループを先に検索
  let existing: { id: string } | null = null
  try {
    const res = await withTimeout(
      db.from('groups').select('id').eq('line_group_id', line_group_id).maybeSingle(),
      6000, 'SELECT groups'
    )
    existing = res.data
  } catch (e) {
    return c.json({ error: `Step1 failed (${Date.now()-t0}ms): ${(e as Error).message}` }, 500)
  }

  let groupId: string

  if (existing) {
    groupId = existing.id
  } else {
    try {
      const res = await withTimeout(
        db.from('groups').insert({ line_group_id, name: name ?? null }).select('id').single(),
        6000, 'INSERT groups'
      )
      if (res.error || !res.data) return c.json({ error: `Step2 DB error: ${res.error?.message}` }, 500)
      groupId = res.data.id
    } catch (e) {
      return c.json({ error: `Step2 failed (${Date.now()-t0}ms): ${(e as Error).message}` }, 500)
    }
  }

  // メンバー登録
  try {
    await withTimeout(
      db.from('group_members').upsert(
        { group_id: groupId, user_id: user.id, is_active: true },
        { onConflict: 'group_id,user_id' }
      ),
      6000, 'UPSERT group_members'
    )
  } catch (e) {
    return c.json({ error: `Step3 failed (${Date.now()-t0}ms): ${(e as Error).message}` }, 500)
  }

  return c.json({ id: groupId, ms: Date.now() - t0 })
})

/** メンバーを削除（is_active = false） */
groups.delete('/:groupId/members/:userId', async (c) => {
  const { groupId, userId } = c.req.param()
  const me = c.get('user')

  // 自分自身は削除不可
  if (userId === me.id) return c.json({ error: 'Cannot remove yourself' }, 400)

  const { error } = await db
    .from('group_members')
    .update({ is_active: false })
    .eq('group_id', groupId)
    .eq('user_id', userId)

  if (error) return c.json({ error: 'DB error' }, 500)
  return c.json({ ok: true })
})

/** グループに参加（招待リンク経由） */
groups.post('/:groupId/join', async (c) => {
  const { groupId } = c.req.param()
  const user = c.get('user')

  const { data: group } = await db.from('groups').select('id').eq('id', groupId).maybeSingle()
  if (!group) return c.json({ error: 'Group not found' }, 404)

  await db.from('group_members').upsert(
    { group_id: groupId, user_id: user.id, is_active: true },
    { onConflict: 'group_id,user_id' }
  )

  return c.json({ id: groupId })
})

/** グループメンバー一覧 */
groups.get('/:groupId/members', async (c) => {
  const { groupId } = c.req.param()

  const { data: memberRows, error: memberError } = await db
    .from('group_members')
    .select('user_id, weight')
    .eq('group_id', groupId)
    .eq('is_active', true)

  if (memberError) return c.json({ error: 'DB error' }, 500)

  const userIds = (memberRows ?? []).map((r: { user_id: string }) => r.user_id)
  if (userIds.length === 0) return c.json([])

  const { data: users, error: userError } = await db
    .from('users')
    .select('id, line_user_id, display_name, picture_url')
    .in('id', userIds)

  if (userError) return c.json({ error: 'DB error' }, 500)

  const weightMap = new Map(
    (memberRows ?? []).map((r: { user_id: string; weight: number }) => [r.user_id, r.weight])
  )

  const result = (users ?? []).map((u: { id: string }) => ({
    ...u,
    weight: weightMap.get(u.id) ?? 1,
  }))

  return c.json(result)
})

/** メンバーの傾斜割weight を更新 */
groups.patch('/:groupId/members/:userId/weight', async (c) => {
  const { groupId, userId } = c.req.param()
  const { weight } = await c.req.json<{ weight: number }>()

  if (weight <= 0) return c.json({ error: 'Weight must be positive' }, 400)

  const { error } = await db
    .from('group_members')
    .update({ weight })
    .eq('group_id', groupId)
    .eq('user_id', userId)

  if (error) return c.json({ error: 'DB error' }, 500)
  return c.json({ ok: true })
})

/** グループ残高 */
groups.get('/:groupId/balance', async (c) => {
  const { groupId } = c.req.param()

  const { data, error } = await db
    .from('payments')
    .select('payer_id, payment_splits(user_id, amount)')
    .eq('group_id', groupId)
    .eq('status', 'approved')
    .eq('settled', false)

  if (error) return c.json({ error: 'DB error' }, 500)

  const payments = (data ?? []).map((p: { payer_id: string; payment_splits: Array<{ user_id: string; amount: number }> }) => ({
    payer_id: p.payer_id,
    splits: p.payment_splits,
  }))

  const balances = calcBalances(payments)
  const result = [...balances.entries()].map(([user_id, balance]) => ({ user_id, balance }))
  return c.json(result)
})

/** グループの支払い報告一覧 */
groups.get('/:groupId/payments', async (c) => {
  const { groupId } = c.req.param()

  // payments を取得
  const { data: paymentRows, error } = await db
    .from('payments')
    .select('id, reporter_id, payer_id, amount, description, note, status, settled, created_at')
    .eq('group_id', groupId)
    .eq('settled', false)
    .order('created_at', { ascending: false })

  if (error) return c.json({ error: 'DB error' }, 500)
  if (!paymentRows || paymentRows.length === 0) return c.json([])

  const paymentIds = paymentRows.map((p: { id: string }) => p.id)

  // splits を取得
  const { data: splitRows } = await db
    .from('payment_splits')
    .select('payment_id, user_id, amount')
    .in('payment_id', paymentIds)

  // approvals を取得
  const { data: approvalRows } = await db
    .from('approvals')
    .select('payment_id, user_id, action, comment')
    .in('payment_id', paymentIds)

  // ユーザーIDをまとめて取得
  const allUserIds = new Set<string>()
  paymentRows.forEach((p: { reporter_id: string; payer_id: string }) => {
    allUserIds.add(p.reporter_id)
    allUserIds.add(p.payer_id)
  })
  ;(splitRows ?? []).forEach((s: { user_id: string }) => allUserIds.add(s.user_id))

  const { data: userRows } = allUserIds.size > 0
    ? await db.from('users').select('id, display_name, picture_url').in('id', [...allUserIds])
    : { data: [] }

  const userMap = new Map((userRows ?? []).map((u: { id: string }) => [u.id, u]))

  // 組み立て
  const result = paymentRows.map((p: {
    id: string; reporter_id: string; payer_id: string;
    amount: number; description: string; note: string | null; status: string;
    settled: boolean; created_at: string
  }) => ({
    ...p,
    payer:    userMap.get(p.payer_id)    ?? null,
    reporter: userMap.get(p.reporter_id) ?? null,
    splits: (splitRows ?? [])
      .filter((s: { payment_id: string }) => s.payment_id === p.id)
      .map((s: { user_id: string; amount: number }) => ({
        user_id: s.user_id,
        amount:  s.amount,
        user:    userMap.get(s.user_id) ?? null,
      })),
    approvals: (approvalRows ?? [])
      .filter((a: { payment_id: string }) => a.payment_id === p.id),
  }))

  return c.json(result)
})

export default groups
