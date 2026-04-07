import { getAccessToken } from './liff'
import type {
  Payment,
  Settlement,
  NettingMethod,
  GroupBalance,
  User,
  MyPaymentTask,
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
  return request<{ id: string }>(`/groups?${params}`, { method: 'POST' })
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
  return request<Payment>('/payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function approvePayment(paymentId: string, action: 'approved' | 'rejected', comment?: string) {
  return request<Payment>(`/payments/${paymentId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ action, comment }),
  })
}

export function updateMemberWeight(groupId: string, userId: string, weight: number) {
  return request<{ ok: boolean }>(`/groups/${groupId}/members/${userId}/weight`, {
    method: 'PATCH',
    body: JSON.stringify({ weight }),
  })
}

export function deletePayment(paymentId: string) {
  return request<{ ok: boolean }>(`/payments/${paymentId}`, { method: 'DELETE' })
}

// ─── Settlements ───────────────────────────────────────────
export function createSettlement(groupId: string, method: NettingMethod) {
  return request<Settlement>('/settlements', {
    method: 'POST',
    body: JSON.stringify({ group_id: groupId, method }),
  })
}

export function getSettlementHistory(groupId: string) {
  return request<Settlement[]>(`/settlements/groups/${groupId}`)
}

export function getMyPaymentTasks(groupId: string) {
  return request<MyPaymentTask[]>(`/settlements/groups/${groupId}/my-tasks`)
}

export function updatePaymentTaskPaid(resultId: string, paid: boolean) {
  return request<{ ok: boolean }>(`/settlements/results/${resultId}/paid`, {
    method: 'PATCH',
    body: JSON.stringify({ paid }),
  })
}
