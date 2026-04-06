export type Flow = { from: string; to: string; amount: number }

/**
 * マルチラテラルNetting
 * 各ユーザーの純債務を計算し、支払い回数を最小化する（greedy法）
 */
export function multilateralNetting(balances: Map<string, number>): Flow[] {
  const results: Flow[] = []

  // 債務者（負: 支払い超過）と債権者（正: 受け取り超過）に分類
  const debtors  = [...balances.entries()]
    .filter(([, b]) => b < 0)
    .map(([id, b]) => ({ id, amount: -b }))
    .sort((a, b) => b.amount - a.amount)

  const creditors = [...balances.entries()]
    .filter(([, b]) => b > 0)
    .map(([id, b]) => ({ id, amount: b }))
    .sort((a, b) => b.amount - a.amount)

  let i = 0, j = 0
  while (i < debtors.length && j < creditors.length) {
    const transfer = Math.min(debtors[i].amount, creditors[j].amount)
    results.push({ from: debtors[i].id, to: creditors[j].id, amount: transfer })
    debtors[i].amount  -= transfer
    creditors[j].amount -= transfer
    if (debtors[i].amount  === 0) i++
    if (creditors[j].amount === 0) j++
  }

  return results
}

/**
 * バイラテラルNetting
 * ペアごとに双方向の債務を相殺する
 */
export function bilateralNetting(flows: Flow[]): Flow[] {
  // pair key: 小さいIDを先に置く
  const net = new Map<string, number>()

  for (const { from, to, amount } of flows) {
    const [a, b] = from < to ? [from, to] : [to, from]
    const sign = from < to ? 1 : -1
    net.set(`${a}:${b}`, (net.get(`${a}:${b}`) ?? 0) + sign * amount)
  }

  const results: Flow[] = []
  for (const [key, value] of net) {
    if (value === 0) continue
    const [a, b] = key.split(':')
    results.push(
      value > 0
        ? { from: a, to: b, amount: value }
        : { from: b, to: a, amount: -value }
    )
  }

  return results
}

/**
 * 承認済み・未精算の payments からユーザーごとの残高を計算する
 * 正: 受け取り超過（債権）/ 負: 支払い超過（債務）
 */
export function calcBalances(
  payments: Array<{
    payer_id: string
    splits: Array<{ user_id: string; amount: number }>
  }>
): Map<string, number> {
  const balances = new Map<string, number>()

  const add = (userId: string, delta: number) => {
    balances.set(userId, (balances.get(userId) ?? 0) + delta)
  }

  for (const p of payments) {
    for (const split of p.splits) {
      if (split.user_id === p.payer_id) continue // 立替者自身の分は相殺済み
      add(split.user_id, -split.amount) // 負担者は支払い義務が増える
      add(p.payer_id,    +split.amount) // 立替者は受け取り権が増える
    }
  }

  return balances
}
