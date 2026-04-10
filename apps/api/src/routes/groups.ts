import { Hono } from 'hono'
import { db } from '../lib/db'
import { authMiddleware } from '../lib/auth'
import { calcBalances } from '../lib/netting'

const groups = new Hono()
groups.use('*', authMiddleware)

/** ランダムな join_token を生成（暗号学的乱数・24文字英数字） */
function generateJoinToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => chars[b % chars.length]).join('')
}

/** グループのメンバーシップを確認するヘルパー */
async function assertMember(groupId: string, userId: string): Promise<boolean> {
  const { data } = await db
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  return !!data
}

/** グループ登録 or 取得（クエリパラメータで受け取る） */
groups.post('/', async (c) => {
  const line_group_id = c.req.query('gid') ?? ''
  const name = c.req.query('name') ?? undefined
  if (!line_group_id) return c.json({ error: 'gid is required' }, 400)
  const user = c.get('user')

  // 既存グループを先に検索
  const { data: existing } = await db
    .from('groups')
    .select('id, join_token')
    .eq('line_group_id', line_group_id)
    .maybeSingle()

  let groupId: string
  let joinToken: string

  if (existing) {
    groupId = existing.id
    joinToken = existing.join_token
  } else {
    joinToken = generateJoinToken()
    const { data: created, error } = await db
      .from('groups')
      .insert({ line_group_id, name: name ?? null, join_token: joinToken })
      .select('id')
      .single()
    if (error || !created) return c.json({ error: 'Failed to create group' }, 500)
    groupId = created.id
  }

  // メンバー登録
  await db.from('group_members').upsert(
    { group_id: groupId, user_id: user.id, is_active: true },
    { onConflict: 'group_id,user_id' }
  )

  return c.json({ id: groupId, join_token: joinToken })
})

/** メンバーを削除（is_active = false） */
groups.delete('/:groupId/members/:userId', async (c) => {
  const { groupId, userId } = c.req.param()
  const me = c.get('user')

  if (!(await assertMember(groupId, me.id))) return c.json({ error: 'Forbidden' }, 403)
  if (userId === me.id) return c.json({ error: 'Cannot remove yourself' }, 400)

  const { error } = await db
    .from('group_members')
    .update({ is_active: false })
    .eq('group_id', groupId)
    .eq('user_id', userId)

  if (error) return c.json({ error: 'DB error' }, 500)
  return c.json({ ok: true })
})

/** グループに参加（招待リンク経由） — join_token で検証 */
groups.post('/:groupId/join', async (c) => {
  const { groupId } = c.req.param()
  const token = c.req.query('token') ?? ''
  const user = c.get('user')

  const { data: group } = await db
    .from('groups')
    .select('id, join_token')
    .eq('id', groupId)
    .maybeSingle()

  if (!group) return c.json({ error: 'Group not found' }, 404)
  if (!token || group.join_token !== token) return c.json({ error: 'Invalid invite token' }, 403)

  await db.from('group_members').upsert(
    { group_id: groupId, user_id: user.id, is_active: true },
    { onConflict: 'group_id,user_id' }
  )

  return c.json({ id: groupId })
})

/** 自分が参加しているグループ一覧 */
groups.get('/my-groups', async (c) => {
  const user = c.get('user')

  const { data: memberRows, error } = await db
    .from('group_members')
    .select('group_id')
    .eq('user_id', user.id)
    .eq('is_active', true)

  if (error) return c.json({ error: 'DB error' }, 500)
  if (!memberRows || memberRows.length === 0) return c.json([])

  const groupIds = memberRows.map((m: { group_id: string }) => m.group_id)

  const { data: groupRows } = await db
    .from('groups')
    .select('id, name, created_at')
    .in('id', groupIds)
    .order('created_at', { ascending: false })

  return c.json(groupRows ?? [])
})

/** グループ情報取得 */
groups.get('/:groupId', async (c) => {
  const { groupId } = c.req.param()
  const user = c.get('user')

  if (!(await assertMember(groupId, user.id))) return c.json({ error: 'Forbidden' }, 403)

  const { data, error } = await db
    .from('groups')
    .select('id, name, created_at')
    .eq('id', groupId)
    .single()

  if (error || !data) return c.json({ error: 'Group not found' }, 404)
  return c.json(data)
})

/** グループメンバー一覧 */
groups.get('/:groupId/members', async (c) => {
  const { groupId } = c.req.param()
  const user = c.get('user')

  if (!(await assertMember(groupId, user.id))) return c.json({ error: 'Forbidden' }, 403)

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

/** メンバーの傾斜割weight を更新（クエリパラメータで受け取る） */
groups.patch('/:groupId/members/:userId/weight', async (c) => {
  const { groupId, userId } = c.req.param()
  const user = c.get('user')
  const weight = Number(c.req.query('weight'))

  if (!(await assertMember(groupId, user.id))) return c.json({ error: 'Forbidden' }, 403)
  if (weight <= 0 || weight > 100) return c.json({ error: 'Weight must be between 0 and 100' }, 400)

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
  const user = c.get('user')

  if (!(await assertMember(groupId, user.id))) return c.json({ error: 'Forbidden' }, 403)

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
  const user = c.get('user')

  if (!(await assertMember(groupId, user.id))) return c.json({ error: 'Forbidden' }, 403)

  const { data: paymentRows, error } = await db
    .from('payments')
    .select('id, reporter_id, payer_id, amount, description, note, status, settled, created_at')
    .eq('group_id', groupId)
    .eq('settled', false)
    .order('created_at', { ascending: false })

  if (error) return c.json({ error: 'DB error' }, 500)
  if (!paymentRows || paymentRows.length === 0) return c.json([])

  const paymentIds = paymentRows.map((p: { id: string }) => p.id)

  const { data: splitRows } = await db
    .from('payment_splits')
    .select('payment_id, user_id, amount')
    .in('payment_id', paymentIds)

  const { data: approvalRows } = await db
    .from('approvals')
    .select('payment_id, user_id, action, comment')
    .in('payment_id', paymentIds)

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
