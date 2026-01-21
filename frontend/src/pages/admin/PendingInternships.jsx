import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../utils/supabase'
import { logAdminAction } from '../../utils/logging'
import Spinner from '../../components/Spinner'
import Table from '../../components/Table'
import Modal from '../../components/Modal'
import toast from 'react-hot-toast'

async function fetchAllInternships() {
  const { data, error } = await supabase
    .from('internships')
    .select(`
      *,
      profiles:software_house_id (
        id,
        organization_name,
        full_name
      )
    `)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

async function updateInternshipStatus(id, status, feedback) {
  const updateData = { status }
  
  // Handle feedback: set it if provided, clear it if resetting to pending
  if (status === 'pending') {
    updateData.feedback = null // Clear feedback when resetting to pending
  } else if (feedback) {
    updateData.feedback = feedback
  }
  
  // Set approved_at timestamp when approving, clear it when resetting
  if (status === 'approved') {
    updateData.approved_at = new Date().toISOString()
  } else if (status === 'pending') {
    updateData.approved_at = null // Clear approved_at when resetting
  }
  
  const { error } = await supabase
    .from('internships')
    .update(updateData)
    .eq('id', id)
  
  if (error) throw error
  
  // Log admin action using the utility function
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const actionType = status === 'pending' ? 'reset_internship' : `${status}_internship`
    await logAdminAction(
      actionType,
      'internship',
      id,
      feedback
    )
  }
}

export default function PendingInternships() {
  const [selectedInternship, setSelectedInternship] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetInternship, setResetInternship] = useState(null)
  const [action, setAction] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all', 'pending', 'approved', 'rejected'
  const [processingAction, setProcessingAction] = useState(false) // Loading state for actions
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['internships', 'all'],
    queryFn: fetchAllInternships
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, status, feedback }) => updateInternshipStatus(id, status, feedback),
    onMutate: () => {
      setProcessingAction(true)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries(['internships', 'all'])
      const statusMsg = variables.status === 'approved' 
        ? 'approved' 
        : variables.status === 'rejected' 
        ? 'rejected' 
        : 'reset to pending'
      toast.success(`Internship ${statusMsg} successfully`)
      setShowModal(false)
      setShowResetModal(false)
      setSelectedInternship(null)
      setResetInternship(null)
      setFeedback('')
      setProcessingAction(false)
    },
    onError: (error) => {
      toast.error(error.message)
      setProcessingAction(false)
    }
  })

  const handleReview = (internship, status) => {
    setSelectedInternship(internship)
    setAction(status)
    setShowModal(true)
  }

  const handleConfirm = () => {
    if (processingAction) return
    if (action === 'rejected' && !feedback.trim()) {
      return toast.error('Please provide feedback for rejection')
    }
    updateMutation.mutate({
      id: selectedInternship.id,
      status: action,
      feedback: feedback.trim() || null
    })
  }

  const handleResetClick = (internship) => {
    if (processingAction) return
    setResetInternship(internship)
    setShowResetModal(true)
  }

  const handleResetConfirm = () => {
    if (processingAction || !resetInternship) return
    updateMutation.mutate({
      id: resetInternship.id,
      status: 'pending',
      feedback: null
    })
  }

  if (isLoading) return <Spinner />

  // Calculate counts for each status
  const allInternships = data || []
  const pendingCount = allInternships.filter(i => i.status === 'pending').length
  const approvedCount = allInternships.filter(i => i.status === 'approved').length
  const rejectedCount = allInternships.filter(i => i.status === 'rejected').length
  const totalCount = allInternships.length

  // Filter internships based on selected status
  const filteredInternships = statusFilter === 'all' 
    ? allInternships 
    : allInternships.filter(i => i.status === statusFilter)

  const getStatusBadge = (status) => {
    const styles = {
      approved: 'bg-gradient-to-r from-green-500 to-emerald-600 text-white',
      pending: 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white',
      rejected: 'bg-gradient-to-r from-red-500 to-rose-600 text-white'
    }
    return styles[status] || 'bg-gray-500 text-white'
  }

  return (
    <div className="space-y-6">
      {/* Header aligned with Admin Dashboard (colored panel) */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
    <div>
              <h1 className="text-3xl font-bold text-blue-600">Post Internship Approval</h1>
              <p className="text-sm text-gray-600 mt-1">
                Review and manage all internship posts from software houses.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Status Statistics */}
              <div className="bg-white px-4 py-2 rounded-lg shadow-sm border border-indigo-200">
                <div className="text-xs text-gray-500">Total</div>
                <div className="text-2xl font-bold text-indigo-600">{totalCount}</div>
              </div>
              <div className="bg-gradient-to-br from-yellow-50 to-orange-50 px-4 py-2 rounded-lg shadow-sm border-2 border-yellow-200">
                <div className="text-xs text-yellow-700 font-semibold">Pending</div>
                <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 px-4 py-2 rounded-lg shadow-sm border-2 border-green-200">
                <div className="text-xs text-green-700 font-semibold">Approved</div>
                <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
              </div>
              <div className="bg-gradient-to-br from-red-50 to-rose-50 px-4 py-2 rounded-lg shadow-sm border-2 border-red-200">
                <div className="text-xs text-red-700 font-semibold">Rejected</div>
                <div className="text-2xl font-bold text-red-600">{rejectedCount}</div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-indigo-200">
            <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filter by Status:
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  statusFilter === 'all'
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                All ({totalCount})
              </button>
              <button
                onClick={() => setStatusFilter('pending')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  statusFilter === 'pending'
                    ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-lg'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-yellow-50'
                }`}
              >
                Pending ({pendingCount})
              </button>
              <button
                onClick={() => setStatusFilter('approved')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  statusFilter === 'approved'
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-green-50'
                }`}
              >
                Approved ({approvedCount})
              </button>
              <button
                onClick={() => setStatusFilter('rejected')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  statusFilter === 'rejected'
                    ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-red-50'
                }`}
              >
                Rejected ({rejectedCount})
              </button>
            </div>
          </div>
        </div>
      </div>

      {!filteredInternships || filteredInternships.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-12 text-center">
          <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-green-100 to-emerald-100 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {statusFilter === 'all' 
              ? 'No Internships Found' 
              : statusFilter === 'pending'
              ? 'No Pending Internships'
              : statusFilter === 'approved'
              ? 'No Approved Internships'
              : 'No Rejected Internships'}
          </h3>
          <p className="text-gray-600">
            {statusFilter === 'all' 
              ? 'No internships have been posted yet.' 
              : statusFilter === 'pending'
              ? 'All internships have been reviewed.'
              : `No ${statusFilter} internships found.`}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
      <Table
        columns={[
                { 
                  Header: 'Title', 
                  accessor: (r) => (
                    <div className="flex items-start gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600 flex-shrink-0 mt-0.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h.01M8 3h8a2 2 0 012 2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2zm0 4h8" />
                        </svg>
                      </span>
                      <div className="flex flex-col min-w-0">
                        <div className="font-semibold text-gray-900">{r.title}</div>
                        <div className="text-xs text-gray-500 mt-1 line-clamp-2">{r.description?.substring(0, 100)}...</div>
                      </div>
                    </div>
                  )
                },
                { 
                  Header: 'Posted By', 
                  accessor: (r) => (
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                        <span className="text-xs font-semibold text-white">
                          {(r.profiles?.organization_name || r.profiles?.full_name || 'N/A')[0]?.toUpperCase()}
                        </span>
                      </div>
                      <span className="text-sm text-gray-700">
                        {r.profiles?.organization_name || r.profiles?.full_name || 'N/A'}
                      </span>
                    </div>
                  )
                },
                { 
                  Header: 'Skills', 
                  accessor: (r) => (
                    <div className="flex flex-wrap gap-1">
                      {(r.skills || []).slice(0, 3).map((skill, idx) => (
                        <span key={idx} className="px-2 py-1 bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-800 rounded-md text-xs font-medium">
                          {skill}
                        </span>
                      ))}
                      {(r.skills || []).length > 3 && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-md text-xs font-medium">
                          +{(r.skills || []).length - 3}
                        </span>
                      )}
                    </div>
                  )
                },
                { 
                  Header: 'Details', 
                  accessor: (r) => (
                    <div className="text-sm">
                      <div className="text-gray-700"><span className="font-medium">Duration:</span> {r.duration}</div>
                      {r.location && (
                        <div className="text-gray-600 mt-1">
                          <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {r.location}
                        </div>
                      )}
                    </div>
                  )
                },
                { 
                  Header: 'Created', 
                  accessor: (r) => (
                    <div className="text-sm text-gray-600">
                      {new Date(r.created_at).toLocaleDateString()}
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  )
                },
                { 
                  Header: 'Status', 
                  accessor: (r) => (
                    <span className={`px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm ${getStatusBadge(r.status)}`}>
                      {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                    </span>
                  )
                },
                { 
                  Header: 'Actions', 
                  accessor: (r) => (
            <div className="flex items-center gap-2">
                      {r.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleReview(r, 'approved')}
                            className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg text-sm font-semibold hover:from-green-700 hover:to-emerald-700 transition-all duration-200 shadow-md flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Approve
                          </button>
                          <button
                            onClick={() => handleReview(r, 'rejected')}
                            className="px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-lg text-sm font-semibold hover:from-red-700 hover:to-rose-700 transition-all duration-200 shadow-md flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Reject
                          </button>
                        </>
                      )}
                      {(r.status === 'approved' || r.status === 'rejected') && (
                        <button
                          onClick={() => handleResetClick(r)}
                          className="px-4 py-2 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg text-sm font-semibold hover:from-gray-700 hover:to-gray-800 transition-all duration-200 shadow-md flex items-center gap-2"
                          title="Reset to pending for re-review"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Reset
                        </button>
                      )}
                    </div>
                  )
                },
              ]}
              data={filteredInternships || []}
            />
          </div>
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false)
          setSelectedInternship(null)
          setFeedback('')
        }}
        title={
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              action === 'approved' 
                ? 'bg-gradient-to-br from-green-100 to-emerald-100' 
                : 'bg-gradient-to-br from-red-100 to-rose-100'
            }`}>
              {action === 'approved' ? (
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {action === 'approved' ? 'Approve' : 'Reject'} Internship
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {action === 'approved'
                  ? 'This internship will be visible to students and guests'
                  : 'This internship will be rejected and hidden'
                }
              </p>
            </div>
          </div>
        }
      >
        <div className="space-y-6">
          <div>
            <div className="bg-gradient-to-br from-gray-50 to-blue-50 p-5 rounded-xl border border-gray-200">
              <h3 className="font-bold text-lg text-gray-900 mb-2">{selectedInternship?.title}</h3>
              <p className="text-sm text-gray-700 mb-4">{selectedInternship?.description}</p>
              
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase">Posted By</span>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                      <span className="text-xs font-semibold text-white">
                        {(selectedInternship?.profiles?.organization_name || selectedInternship?.profiles?.full_name || 'N/A')[0]?.toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      {selectedInternship?.profiles?.organization_name || selectedInternship?.profiles?.full_name || 'N/A'}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase">Duration</span>
                  <div className="text-sm font-medium text-gray-700 mt-1">{selectedInternship?.duration}</div>
                </div>
                {selectedInternship?.location && (
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase">Location</span>
                    <div className="text-sm font-medium text-gray-700 mt-1 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {selectedInternship.location}
                    </div>
                  </div>
                )}
                {selectedInternship?.stipend && (
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase">Stipend</span>
                    <div className="text-sm font-medium text-gray-700 mt-1">${selectedInternship.stipend}</div>
                  </div>
                )}
              </div>

              {selectedInternship?.skills && selectedInternship.skills.length > 0 && (
                <div className="mt-4">
                  <span className="text-xs font-semibold text-gray-500 uppercase">Skills Required</span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedInternship.skills.map((skill, idx) => (
                      <span key={idx} className="px-3 py-1 bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-800 rounded-md text-xs font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {action === 'rejected' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Feedback (Required)
              </label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Provide reason for rejection..."
                rows={4}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all"
                required
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={() => {
                if (processingAction) return
                setShowModal(false)
                setSelectedInternship(null)
                setFeedback('')
              }}
              disabled={processingAction}
              className="px-6 py-2.5 border-2 border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={processingAction}
              className={`px-6 py-2.5 rounded-lg text-white font-semibold transition-all duration-200 shadow-lg flex items-center gap-2 ${
                action === 'approved'
                  ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700'
                  : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {processingAction ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                <>
                  {action === 'approved' ? (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Approve</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span>Reject</span>
                    </>
                  )}
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Reset Confirmation Modal */}
      <Modal
        isOpen={showResetModal}
        onClose={() => {
          setShowResetModal(false)
          setResetInternship(null)
        }}
        title={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Reset Internship Status</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Reset this internship back to pending for re-review
              </p>
            </div>
          </div>
        }
      >
        <div className="space-y-6">
          <div>
            <p className="text-sm text-gray-700 mb-4">
              Are you sure you want to reset this internship to <span className="font-semibold text-yellow-600">pending</span> status?
            </p>
            <div className="bg-gradient-to-br from-gray-50 to-blue-50 p-5 rounded-xl border border-gray-200">
              <h3 className="font-bold text-lg text-gray-900 mb-2">{resetInternship?.title}</h3>
              <p className="text-sm text-gray-700 mb-4">{resetInternship?.description}</p>
              
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase">Current Status</span>
                  <div className="mt-1">
                    <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                      resetInternship?.status === 'approved'
                        ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white'
                        : 'bg-gradient-to-r from-red-500 to-rose-600 text-white'
                    }`}>
                      {resetInternship?.status?.charAt(0).toUpperCase() + resetInternship?.status?.slice(1)}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase">Posted By</span>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                      <span className="text-xs font-semibold text-white">
                        {(resetInternship?.profiles?.organization_name || resetInternship?.profiles?.full_name || 'N/A')[0]?.toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      {resetInternship?.profiles?.organization_name || resetInternship?.profiles?.full_name || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {resetInternship?.feedback && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <span className="text-xs font-semibold text-gray-500 uppercase">Previous Feedback</span>
                  <p className="text-sm text-gray-700 mt-2 bg-white p-3 rounded-lg border border-gray-200">
                    {resetInternship.feedback}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h4 className="text-sm font-semibold text-yellow-800 mb-1">What will happen?</h4>
                <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
                  <li>The internship status will be reset to <span className="font-semibold">pending</span></li>
                  <li>Previous feedback will be cleared</li>
                  <li>The internship will need to be reviewed again</li>
                  <li>This action will be logged in the activity logs</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={() => {
                if (processingAction) return
                setShowResetModal(false)
                setResetInternship(null)
              }}
              disabled={processingAction}
              className="px-6 py-2.5 border-2 border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleResetConfirm}
              disabled={processingAction}
              className="px-6 py-2.5 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg font-semibold hover:from-gray-700 hover:to-gray-800 transition-all duration-200 shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processingAction ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Reset to Pending</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}