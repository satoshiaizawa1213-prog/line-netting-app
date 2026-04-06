import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary } from '@/ErrorBoundary'
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation'
import HomePage from '@/pages/HomePage'
import PaymentReportPage from '@/pages/PaymentReportPage'
import ApprovalPage from '@/pages/ApprovalPage'
import SettlementPage from '@/pages/SettlementPage'
import SettlementResultPage from '@/pages/SettlementResultPage'
import SettlementHistoryPage from '@/pages/SettlementHistoryPage'
import MembersPage from '@/pages/MembersPage'
import MyPaymentsPage from '@/pages/MyPaymentsPage'
import JoinGroupPage from '@/pages/JoinGroupPage'

function SwipeNavigation() {
  useSwipeNavigation()
  return null
}

export default function App() {
  // グループIDは localStorage から取得。未設定なら JoinGroupPage を表示
  const [groupId, setGroupId] = useState<string>(() => localStorage.getItem('groupId') ?? '')

  function handleJoin(id: string) {
    localStorage.setItem('groupId', id)
    sessionStorage.setItem('groupId', id)
    setGroupId(id)
  }

  if (!groupId) {
    return <JoinGroupPage currentGroupId={sessionStorage.getItem('groupId') ?? ''} onJoin={handleJoin} />
  }

  return (
    <ErrorBoundary>
      <SwipeNavigation />
      <Routes>
        <Route path="/"                          element={<HomePage />} />
        <Route path="/payments/new"              element={<PaymentReportPage />} />
        <Route path="/payments/:paymentId"       element={<ApprovalPage />} />
        <Route path="/settlements/new"           element={<SettlementPage />} />
        <Route path="/settlements/:settlementId" element={<SettlementResultPage />} />
        <Route path="/settlements/history"       element={<SettlementHistoryPage />} />
        <Route path="/members"                   element={<MembersPage />} />
        <Route path="/my-payments"               element={<MyPaymentsPage />} />
        <Route path="*"                          element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}
