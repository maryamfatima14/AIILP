import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../utils/supabase'
import { logAdminAction } from '../../utils/logging'
import Spinner from '../../components/Spinner'
import Table from '../../components/Table'
import Modal from '../../components/Modal'
import toast from 'react-hot-toast'

async function fetchPendingAccounts() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .or('role.eq.software_house,role.eq.guest')
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

async function reviewAccount(profileId, action, feedback, accountData) {
  // Update profile approval status
  const { error } = await supabase
    .from('profiles')
    .update({
      approval_status: action === 'approve' ? 'approved' : 'rejected',
      is_active: action === 'approve'
    })
    .eq('id', profileId)
  
  if (error) throw error
  
  // Log admin action using the utility function (bypasses RLS via function)
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await logAdminAction(
      action === 'approve' ? 'approve_account' : 'reject_account',
      'profile',
      profileId,
      feedback
    )
  }

  // Send approval/rejection email to user
  // Backend will fetch email from auth.users automatically
  try {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || ''
    const apiUrl = backendUrl || (import.meta.env.DEV ? '/api' : '')
    
    const emailResponse = await fetch(`${apiUrl}/api/admin/send-approval-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: profileId,
        action: action,
        feedback: feedback || null,
        userEmail: accountData?.email || null, // Optional - backend will fetch if not provided
        userName: accountData?.full_name || accountData?.organization_name || 'User',
        userRole: accountData?.role || ''
      })
    })

    if (emailResponse.ok) {
      console.log(`[PendingAccounts] ✅ ${action === 'approve' ? 'Approval' : 'Rejection'} email sent successfully`)
    } else {
      const errorData = await emailResponse.json().catch(() => ({}))
      console.warn(`[PendingAccounts] ⚠️  Failed to send ${action} email:`, errorData.error || 'Unknown error')
      // Don't throw error - email failure shouldn't block approval/rejection
    }
  } catch (emailErr) {
    console.warn(`[PendingAccounts] ⚠️  Exception sending ${action} email:`, emailErr.message)
    // Don't throw error - email failure shouldn't block approval/rejection
  }
}

export default function PendingAccounts() {
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [action, setAction] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [confirmLoading, setConfirmLoading] = useState(false)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['pending-accounts'],
    queryFn: fetchPendingAccounts
  })

  // Realtime: update list when new profiles are created or approval status changes
  useEffect(() => {
    const channel = supabase
      .channel('admin-pending-accounts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          queryClient.invalidateQueries(['pending-accounts'])
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  const reviewMutation = useMutation({
    mutationFn: ({ profileId, action, feedback, accountData }) => reviewAccount(profileId, action, feedback, accountData),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries(['pending-accounts'])
      toast.success(`Account ${variables.action === 'approve' ? 'approved' : 'rejected'} successfully`)
    },
    onError: (error) => {
      toast.error(error.message)
    }
  })

  const handleReview = (account, actionType) => {
    setSelectedAccount(account)
    setAction(actionType)
    setShowConfirmModal(true)
  }

  const handleConfirm = () => {
    if (action === 'reject') {
      // For reject, show the feedback modal
      setShowConfirmModal(false)
      setShowModal(true)
    } else {
      // For approve, execute directly
      executeConfirmedAction()
    }
  }

  const executeConfirmedAction = () => {
    if (action === 'reject' && !feedback.trim()) {
      return toast.error('Please provide feedback for rejection')
    }
    setConfirmLoading(true)
    reviewMutation.mutate({
      profileId: selectedAccount.id,
      action,
      feedback: feedback.trim() || null,
      accountData: selectedAccount
    }, {
      onSuccess: () => {
        setShowModal(false)
        setShowConfirmModal(false)
        setSelectedAccount(null)
        setFeedback('')
        setAction(null)
      },
      onError: () => {
        // Error already handled in mutation onError
      },
      onSettled: () => {
        setConfirmLoading(false)
      }
    })
  }

  if (isLoading) return <Spinner />

  return (
    <div>
      {/* Header styled like Dashboard */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-blue-600">Pending Account Approvals</h2>
            <p className="text-sm text-gray-600 mt-1">Review new account requests and take action.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-700">
              {data?.length || 0} pending {data?.length === 1 ? 'account' : 'accounts'}
            </div>
            <div className="flex items-center gap-2 bg-white border border-indigo-100 rounded-lg p-1">
              <span className="px-3 py-1.5 rounded-md text-sm font-medium bg-yellow-400 text-white shadow">
                Pending
              </span>
            </div>
          </div>
        </div>
      </div>

      {!data || data.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Pending Accounts</h3>
          <p className="text-gray-600">All accounts have been reviewed.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <Table
            columns={[
              { Header: 'Name', accessor: (r) => r.full_name || r.organization_name || 'N/A' },
              { Header: 'Email', accessor: (r) => {
                // Get email from auth.users via a join or separate query
                return r.email || 'N/A'
              }},
              { Header: 'Role', accessor: (r) => (
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium capitalize">
                  {r.role.replace('_', ' ')}
                </span>
              )},
              { Header: 'Organization', accessor: (r) => r.organization_name || '-' },
              { Header: 'Registered', accessor: (r) => new Date(r.created_at).toLocaleDateString() },
              { Header: 'Actions', accessor: (r) => (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleReview(r, 'approve')}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReview(r, 'reject')}
                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition"
                  >
                    Reject
                  </button>
                </div>
              )},
            ]}
            data={data || []}
          />
        </div>
      )}

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => {
          setShowConfirmModal(false)
          setSelectedAccount(null)
          setAction(null)
        }}
        title={
          action === 'approve'
            ? 'Approve Account'
            : 'Reject Account'
        }
        size="small"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            {action === 'approve' && (
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            )}
            {action === 'reject' && (
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            )}
            <div className="flex-1">
              <p className="text-sm text-gray-700 mb-2">
                {action === 'approve' && (
                  <>
                    Are you sure you want to <strong className="text-green-600">approve</strong> this account? The user will be able to log in and access the platform.
                  </>
                )}
                {action === 'reject' && (
                  <>
                    Are you sure you want to <strong className="text-red-600">reject</strong> this account? You will be asked to provide feedback for the rejection.
                  </>
                )}
              </p>
              {selectedAccount && (
                <div className="bg-gray-50 rounded-lg p-3 mt-3">
                  <p className="text-sm font-semibold text-gray-900">
                    {selectedAccount.full_name || selectedAccount.organization_name || selectedAccount.email || selectedAccount.id.slice(0, 8)}
                  </p>
                  {selectedAccount.email && (
                    <p className="text-xs text-gray-600 mt-1">{selectedAccount.email}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1 capitalize">
                    Role: {selectedAccount.role?.replace('_', ' ')}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={() => {
                setShowConfirmModal(false)
                setSelectedAccount(null)
                setAction(null)
              }}
              disabled={confirmLoading}
              className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={confirmLoading}
              className={`px-5 py-2.5 rounded-lg text-white font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                action === 'approve'
                  ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700'
                  : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700'
              }`}
            >
              {confirmLoading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                <>
                  {action === 'approve' ? 'Approve Account' : 'Continue to Reject'}
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Feedback Modal (for reject only) */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false)
          setFeedback('')
        }}
        title="Reject Account"
        size="medium"
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-2">
              Please provide feedback for rejecting this account. This feedback will be sent to the user.
            </p>
            {selectedAccount && (
              <div className="bg-gray-50 p-3 rounded-lg mb-4">
                <p className="font-medium text-sm">{selectedAccount?.full_name || selectedAccount?.organization_name}</p>
                <p className="text-xs text-gray-600 mt-1 capitalize">{selectedAccount?.role?.replace('_', ' ')}</p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Feedback <span className="text-red-500">*</span>
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Provide reason for rejection..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={() => {
                setShowModal(false)
                setFeedback('')
              }}
              disabled={confirmLoading}
              className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={executeConfirmedAction}
              disabled={confirmLoading || !feedback.trim()}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-red-600 to-rose-600 text-white font-semibold hover:from-red-700 hover:to-rose-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {confirmLoading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                'Reject Account'
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

