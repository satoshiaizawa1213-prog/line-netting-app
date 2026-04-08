import { getAccessToken } from './liff'
import type {
  Payment,
  Settlement,
  NettingMethod,
  GroupBalance,
  User,
  MyPaymentTask,
  SettlementProposal,
} from '@/types'

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAccessToken()}`,
        ...init?.headers,
      },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error ?? `API error ${res.status}`)
    }
    return res.json() as Promise<T>
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('タイムアウト: サーバーが応答しませんでした')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

// ─── Me ────────────────────────────────────────────────────
export function getMe() {
  return request<User>('/me')
}

// ─── Groups ────────────────────────────────────────────────
export function ensureGroup(lineGroupId: string, name?: string) {
  const params = new URLSearchParams({ gid: lineGroupId })
  if (name) params.set('name', name)
  return request<{ id: string; join_token: string }>(`/groups?${params}`, { method: 'POST' })
}

export function getGroupInfo(groupId: string) {
  return request<{ id: string; name: string | null; created_at: string }>(`/groups/${groupId}`)
}

export function getGroupMembers(groupId: string) {
  return request<User[]>(`/groups/${groupId}/members`)
}

export function removeMember(groupId: string, userId: string) {
  return request<{ ok: boolean }>(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' })
}

export function getGroupBalance(groupId: string) {
  return request<GroupBalance[]>(`/groups/${groupId}/balance`)
}

// ─── Payments ──────────────────────────────────────────────
export function getPayments(groupId: string) {
  return request<Payment[]>(`/groups/${groupId}/payments`)
}

export function createPayment(payload: {
  group_id: string
  payer_id: string
  amount: number
  description: string
  note?: string
  splits: Array<{ user_id: string; amount: number }>
}) {
  const params = new URLSearchParams({
    group_id:    payload.group_id,
    payer_id:    payload.payer_id,
    amount:      String(payload.amount),
    description: payload.description,
    splits:      JSON.stringify(payload.splits),
  })
  if (payload.note) params.set('note', payload.note)
  return request<Payment>(`/payments?${params}`, { method: 'POST' })
}

export function approvePayment(paymentId: string, action: 'approved' | 'rejected', comment?: string) {
  const params = new URLSearchParams({ action })
  if (comment) params.set('comment', comment)
  return request<Payment>(`/payments/${paymentId}/approve?${params}`, { method: 'POST' })
}

export function updateMemberWeight(groupId: string, userId: string, weight: number) {
  return request<{ ok: boolean }>(`/groups/${groupId}/members/${userId}/weight?weight=${weight}`, {
    method: 'PATCH',
  })
}

export function deletePayment(paymentId: string) {
  return request<{ ok: boolean }>(`/payments/${paymentId}`, { method: 'DELETE' })
}

// ─── Settlements ───────────────────────────────────────────
export function createSettlement(groupId: string, method: NettingMethod) {
  return request<Settlement>(`/settlements?group_id=${groupId}&method=${method}`, { method: 'POST' })
}

// ─── Settlement Proposals ──────────────────────────────────
export function getProposals(groupId: string) {
  return request<SettlementProposal[]>(`/settlements/proposals?group_id=${groupId}`)
}

export function createProposal(groupId: string, method: NettingMethod) {
  return request<SettlementProposal>(`/settlements/proposals?group_id=${groupId}&method=${method}`, { method: 'POST' })
}

export function approveProposal(proposalId: string) {
  return request<{ status: string; vote_count?: number; total_members?: number; settlement?: Settlement; results?: unknown[] }>(
    `/settlements/proposals/${proposalId}/approve`, { method: 'POST' }
  )
}

export function cancelProposal(proposalId: string) {
  return request<{ ok: boolean }>(`/settlements/proposals/${proposalId}/cancel`, { method: 'POST' })
}

export function getSettlementHistory(groupId: string) {
  return request<Settlement[]>(`/settlements/groups/${groupId}`)
}

export function getMyPaymentTasks(groupId: string) {
  return request<MyPaymentTask[]>(`/settlements/groups/${groupId}/my-tasks`)
}

export function updatePaymentTaskPaid(resultId: string, paid: boolean) {
  return request<{ ok: boolean }>(`/settlements/results/${resultId}/paid?paid=${paid}`, {
    method: 'PATCH',
  })
}
