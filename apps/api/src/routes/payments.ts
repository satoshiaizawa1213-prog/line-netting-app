import { Hono } from 'hono'
import { db } from '../lib/db'
import { authMiddleware } from '../lib/auth'

const payments = new Hono()
payments.use('*', authMiddleware)

/** 支払い報告を作成（クエリパラメータで受け取る） */
payments.post('/', async (c) => {
  const user = c.get('user')
  const group_id    = c.req.query('group_id') ?? ''
  const payer_id    = c.req.query('payer_id') ?? ''
  const amount      = Number(c.req.query('amount'))
  const description = c.req.query('description') ?? ''
  const note        = c.req.query('note') ?? null
  const splitsRaw   = c.req.query('splits') ?? '[]'

  if (!group_id || !payer_id || !amount || !description) {
    return c.json({ error: 'Missing required params' }, 400)
  }

  let splits: Array<{ user_id: string; amount: number }>
  try {
    splits = JSON.parse(splitsRaw)
  } catch {
    return c.json({ error: 'Invalid splits JSON' }, 400)
  }

  // splitsの合計 = amountを検証
  const splitsTotal = splits.reduce((s, sp) => s + sp.amount, 0)
  if (splitsTotal !== amount) {
    return c.json({ error: 'splits total must equal amount' }, 400)
  }

  const { data: payment, error: paymentError } = await db
    .from('payments')
    .insert({ group_id, reporter_id: user.id, payer_id, amount, description, note })
    .select()
    .single()

  if (paymentError || !payment) return c.json({ error: 'Failed to create payment' }, 500)

  const { error: splitError } = await db.from('payment_splits').insert(
    splits.map((s) => ({ payment_id: payment.id, ...s }))
  )

  if (splitError) return c.json({ error: 'Failed to create splits' }, 500)

  return c.json(payment, 201)
})

/** 承認 or 却下（クエリパラメータで受け取る） */
payments.post('/:paymentId/approve', async (c) => {
  const user = c.get('user')
  const { paymentId } = c.req.param()
  const action  = c.req.query('action') as 'approved' | 'rejected' | undefined
  const comment = c.req.query('comment') ?? undefined
  if (!action) return c.json({ error: 'action is required' }, 400)

  // 支払い報告を取得
  const { data: payment, error: fetchError } = await db
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .single()

  if (fetchError || !payment) return c.json({ error: 'Payment not found' }, 404)
  if (payment.status !== 'pending') return c.json({ error: 'Already processed' }, 400)
  if (payment.reporter_id === user.id) return c.json({ error: 'Reporter cannot approve own report' }, 403)

  // 承認ログを挿入
  const { error: approvalError } = await db.from('approvals').insert({
    payment_id: paymentId,
    user_id: user.id,
    action,
    comment: comment ?? null,
  })

  if (approvalError) return c.json({ error: 'Failed to record approval' }, 500)

  // 承認の場合 → payments.status を approved に更新（1人承認で確定）
  // 却下の場合 → payments.status を rejected に更新
  const newStatus = action === 'approved' ? 'approved' : 'rejected'
  const { data: updated, error: updateError } = await db
    .from('payments')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', paymentId)
    .select()
    .single()

  if (updateError) return c.json({ error: 'Failed to update payment status' }, 500)

  return c.json(updated)
})

/** 却下済み支払い報告を削除（報告者のみ） */
payments.delete('/:paymentId', async (c) => {
  const user = c.get('user')
  const { paymentId } = c.req.param()

  const { data: payment, error: fetchError } = await db
    .from('payments')
    .select('reporter_id, status')
    .eq('id', paymentId)
    .single()

  if (fetchError || !payment) return c.json({ error: 'Payment not found' }, 404)
  if (payment.reporter_id !== user.id) return c.json({ error: 'Only reporter can delete' }, 403)
  if (payment.status !== 'rejected') return c.json({ error: 'Only rejected payments can be deleted' }, 400)

  await db.from('approvals').delete().eq('payment_id', paymentId)
  await db.from('payment_splits').delete().eq('payment_id', paymentId)
  const { error } = await db.from('payments').delete().eq('id', paymentId)

  if (error) return c.json({ error: 'DB error' }, 500)
  return c.json({ ok: true })
})

export default payments
