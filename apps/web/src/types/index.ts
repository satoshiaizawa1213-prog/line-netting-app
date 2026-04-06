export type PaymentStatus = 'pending' | 'approved' | 'rejected'
export type NettingMethod = 'multilateral' | 'bilateral'
export type ApprovalAction = 'approved' | 'rejected'

export interface User {
  id: string
  line_user_id: string
  display_name: string
  picture_url: string | null
  weight?: number
}

export interface Group {
  id: string
  line_group_id: string
  name: string | null
  created_at: string
}

export interface PaymentSplit {
  user_id: string
  amount: number
  user?: User
}

export interface Approval {
  payment_id: string
  user_id: string
  action: ApprovalAction
  comment?: string | null
}

export interface Payment {
  id: string
  group_id: string
  reporter_id: string
  payer_id: string
  amount: number
  description: string
  status: PaymentStatus
  settled: boolean
  note?: string | null
  created_at: string
  payer?: User
  reporter?: User
  splits?: PaymentSplit[]
  approvals?: Approval[]
  my_approval?: ApprovalAction | null
  approval_count?: number
}

export interface SettlementResult {
  from_user_id: string
  to_user_id: string
  amount: number
  from_user?: Pick<User, 'id' | 'display_name'>
  to_user?: Pick<User, 'id' | 'display_name'>
}

export interface Settlement {
  id: string
  group_id: string
  method: NettingMethod
  executed_by: string
  created_at: string
  results?: SettlementResult[]
  settlement_payments?: Array<{ payments: Payment }>
}

export interface MyPaymentTask {
  id: string
  amount: number
  paid: boolean
  to_user: Pick<User, 'id' | 'display_name' | 'picture_url'> | null
  settlement: {
    id: string
    created_at: string
    method: NettingMethod
  } | null
}

export interface GroupBalance {
  user_id: string
  balance: number
  user?: User
}
