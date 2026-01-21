import React, { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../context/AuthContext'
import Spinner from '../../components/Spinner'
import Table from '../../components/Table'
import Modal from '../../components/Modal'
import CVPreview from '../CVPreview'
import toast from 'react-hot-toast'

async function fetchApplicationsForOwner(ownerId) {
  const { data: internships } = await supabase
    .from('internships')
    .select('id')
    .eq('software_house_id', ownerId)

  const internshipIds = internships?.map(i => i.id) || []

  if (internshipIds.length === 0) return []

  const { data, error } = await supabase
    .from('applications')
    .select(`
      *,
      internships:internship_id (
        id,
        title,
        description,
        skills
      ),
      profiles:user_id (
        id,
        full_name,
        email
      )
    `)
    .in('internship_id', internshipIds)
    .order('applied_at', { ascending: false })

  if (error) throw error
  return data
}

async function updateApplicationStatus(applicationId, status, feedback) {
  const updateData = { 
    status,
    updated_at: new Date().toISOString()
  }
  
  // Include feedback if provided (required for rejection, optional for acceptance)
  if (feedback && feedback.trim()) {
    updateData.feedback = feedback.trim()
  } else if (status === 'rejected') {
    // For rejection, if no feedback provided, set a default message
    // (This shouldn't happen due to frontend validation, but as a safety measure)
    updateData.feedback = 'Application has been rejected.'
  }

  const { error } = await supabase
    .from('applications')
    .update(updateData)
    .eq('id', applicationId)

  if (error) throw error
  
  return updateData
}

export default function ManageApplications() {
  const { profile } = useAuth()
  const [selectedApplication, setSelectedApplication] = useState(null)
  const [showCVModal, setShowCVModal] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [action, setAction] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [processingAction, setProcessingAction] = useState(false) // Loading state for actions
  // Filters & pagination state
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [internshipFilter, setInternshipFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['applications', 'owner', profile?.id],
    queryFn: () => fetchApplicationsForOwner(profile.id),
    enabled: !!profile?.id
  })

  const updateMutation = useMutation({
    mutationFn: ({ applicationId, status, feedback }) => updateApplicationStatus(applicationId, status, feedback),
    onMutate: () => {
      setProcessingAction(true)
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['applications', 'owner', profile?.id])
      const message = action === 'accepted' 
        ? 'Application accepted successfully!' 
        : 'Application rejected successfully!'
      toast.success(message)
      setShowStatusModal(false)
      setShowDetailsModal(false)
      setSelectedApplication(null)
      setFeedback('')
      setAction(null)
      setProcessingAction(false)
    },
    onError: (error) => {
      console.error('[ManageApplications] Error updating status:', error)
      toast.error(error.message || 'Failed to update application status. Please try again.')
      setProcessingAction(false)
    }
  })

  const handleStatusUpdate = (application, status) => {
    setSelectedApplication(application)
    setAction(status)
    setShowStatusModal(true)
  }

  const handleConfirm = () => {
    if (processingAction) return
    // Feedback is required for rejection, optional for acceptance
    if (action === 'rejected' && !feedback.trim()) {
      return toast.error('Please provide feedback for rejection')
    }
    updateMutation.mutate({
      applicationId: selectedApplication.id,
      status: action,
      feedback: feedback.trim() || null
    })
  }

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      accepted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800'
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  // Derived filters and pagination (must be declared before any early returns)
  const internshipsOptions = useMemo(() => {
    const titles = Array.from(new Set((data || []).map(r => r.internships?.title).filter(Boolean)))
    return titles.sort()
  }, [data])

  const filtered = useMemo(() => {
    let list = data || []
    if (searchTerm.trim()) {
      const s = searchTerm.trim().toLowerCase()
      list = list.filter(r =>
        (r.profiles?.full_name || '').toLowerCase().includes(s) ||
        (r.profiles?.email || '').toLowerCase().includes(s) ||
        (r.internships?.title || '').toLowerCase().includes(s)
      )
    }
    if (statusFilter) {
      list = list.filter(r => r.status === statusFilter)
    }
    if (internshipFilter) {
      list = list.filter(r => r.internships?.title === internshipFilter)
    }
    return list
  }, [data, searchTerm, statusFilter, internshipFilter])

  const totalPages = Math.max(1, Math.ceil((filtered?.length || 0) / pageSize))
  const pageData = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const resetPagination = () => setCurrentPage(1)

  if (isLoading) return <Spinner />

  return (
    <div>
      {/* Header aligned with Admin Dashboard (colored panel) */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-blue-600">Manage Applicants</h1>
            <p className="text-sm text-gray-600 mt-1">
              Review and manage applications directly from students and guests. Applications are sent to you immediately - no admin approval required.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => exportCsv(filtered)}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition flex items-center gap-2 font-medium"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); resetPagination() }}
              placeholder="Search by name, email, or internship..."
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); resetPagination() }}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* Internship Filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Internship
            </label>
            <select
              value={internshipFilter}
              onChange={(e) => { setInternshipFilter(e.target.value); resetPagination() }}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            >
              <option value="">All Internships</option>
              {internshipsOptions.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!filtered || filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-12 text-center">
          <svg className="w-20 h-20 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Applications Found</h3>
          <p className="text-gray-600">Try adjusting your search or filters to find applications.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      <Table
        columns={[
              {
                Header: 'Name',
                accessor: (r) => (
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-lg">
                        {r.profiles?.full_name?.charAt(0) || 'A'}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{r.profiles?.full_name || 'N/A'}</p>
                      <p className="text-xs text-gray-600">{r.profiles?.email || ''}</p>
                    </div>
                  </div>
                )
              },
              {
                Header: 'Applied For',
                accessor: (r) => (
                  <div>
                    <p className="font-medium text-gray-900">{r.internships?.title || 'N/A'}</p>
                  </div>
                )
              },
              {
                Header: 'Applied Date',
                accessor: (r) => new Date(r.applied_at).toLocaleDateString()
              },
              {
                Header: 'CV',
                accessor: (r) => (
                  <button
                    onClick={() => {
                      setSelectedApplication(r)
                      setShowCVModal(true)
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition flex items-center gap-2 shadow-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Preview
                  </button>
                )
              },
              {
                Header: 'Status',
                accessor: (r) => getStatusBadge(r.status)
              },
              {
                Header: 'Action',
                accessor: (r) => (
            <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setSelectedApplication(r); setShowDetailsModal(true) }}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition shadow-sm"
                    >
                      Details
                    </button>
                    {r.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleStatusUpdate(r, 'accepted')}
                          className="p-1.5 bg-green-100 text-green-600 rounded hover:bg-green-200 transition"
                          title="Accept"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleStatusUpdate(r, 'rejected')}
                          className="p-1.5 bg-red-100 text-red-600 rounded hover:bg-red-200 transition"
                          title="Reject"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </>
                    )}
                    {r.status !== 'pending' && (
                      <span className="text-sm text-gray-500">Reviewed</span>
                    )}
            </div>
                )
              }
        ]}
        data={pageData}
      />
      {/* Pagination */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
        <div className="text-sm font-medium text-gray-700">
          Showing <span className="font-semibold">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-semibold">{Math.min(currentPage * pageSize, filtered.length)}</span> of <span className="font-semibold">{filtered.length}</span> applications
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </button>
          <div className="px-3 py-2 text-sm font-medium text-gray-700">
            Page {currentPage} of {totalPages}
          </div>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1"
          >
            Next
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
        </div>
      )}

      {/* CV Preview Modal */}
      <Modal
        isOpen={showCVModal}
        onClose={() => {
          setShowCVModal(false)
          setSelectedApplication(null)
        }}
        title="Applicant CV"
        size="large"
      >
        {selectedApplication && (
          <CVPreview userId={selectedApplication.user_id} onClose={() => setShowCVModal(false)} />
        )}
      </Modal>

      {/* Status Update Modal */}
      <Modal
        isOpen={showStatusModal}
        onClose={() => {
          if (processingAction) return
          setShowStatusModal(false)
          setSelectedApplication(null)
          setFeedback('')
          setAction(null)
        }}
        title={
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              action === 'accepted' 
                ? 'bg-gradient-to-br from-green-100 to-emerald-100' 
                : 'bg-gradient-to-br from-red-100 to-rose-100'
            }`}>
              {action === 'accepted' ? (
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
                {action === 'accepted' ? 'Accept' : 'Reject'} Application
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {action === 'accepted'
                  ? 'This applicant will be notified of acceptance'
                  : 'This applicant will be notified of rejection'
                }
              </p>
            </div>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Applicant Info */}
          <div className="bg-gradient-to-br from-gray-50 to-blue-50 p-5 rounded-xl border border-gray-200">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-2xl font-bold text-white">
                  {selectedApplication?.profiles?.full_name?.[0]?.toUpperCase() || 'A'}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg text-gray-900">{selectedApplication?.profiles?.full_name || 'N/A'}</h3>
                <p className="text-sm text-gray-600 mt-1">{selectedApplication?.profiles?.email || ''}</p>
                <p className="text-sm font-medium text-gray-700 mt-2">
                  Applied for: <span className="text-blue-600">{selectedApplication?.internships?.title || 'N/A'}</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Applied on {new Date(selectedApplication?.applied_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {/* CV Summary */}
          {selectedApplication?.cv_data && (
            <div className="bg-white border-2 border-blue-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  CV Summary
                </h4>
                <button
                  onClick={() => {
                    setShowStatusModal(false)
                    setShowCVModal(true)
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  View Full CV
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedApplication.cv_data.personal && (
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase">Contact</span>
                    <p className="text-sm font-medium text-gray-900 mt-1">
                      {selectedApplication.cv_data.personal.email || 'N/A'}
                    </p>
                    <p className="text-sm text-gray-600">{selectedApplication.cv_data.personal.phone || ''}</p>
                  </div>
                )}
                {selectedApplication.cv_data.education && selectedApplication.cv_data.education.length > 0 && (
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase">Education</span>
                    <p className="text-sm font-medium text-gray-900 mt-1">
                      {selectedApplication.cv_data.education[0]?.degree || 'N/A'}
                    </p>
                    <p className="text-sm text-gray-600">
                      {selectedApplication.cv_data.education[0]?.institution || ''}
                    </p>
                  </div>
                )}
                {selectedApplication.cv_data.skills && selectedApplication.cv_data.skills.length > 0 && (
                  <div className="md:col-span-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase">Skills</span>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedApplication.cv_data.skills.slice(0, 8).map((skill, idx) => (
                        <span key={idx} className="px-3 py-1 bg-blue-50 text-blue-800 rounded-md text-xs font-medium border border-blue-200">
                          {skill}
                        </span>
                      ))}
                      {selectedApplication.cv_data.skills.length > 8 && (
                        <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-md text-xs font-medium">
                          +{selectedApplication.cv_data.skills.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Feedback Section - Required for rejection, optional for acceptance */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              {action === 'accepted' ? (
                <>
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Feedback (Optional)
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Feedback (Required)
                </>
              )}
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={
                action === 'accepted'
                  ? "Add optional feedback for the applicant (e.g., next steps, welcome message)..."
                  : "Provide reason for rejection. This will be sent to the applicant..."
              }
              rows={4}
              className={`w-full px-4 py-3 border-2 rounded-lg transition-all ${
                action === 'accepted'
                  ? 'border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500'
                  : 'border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500'
              }`}
              required={action === 'rejected'}
            />
            {action === 'accepted' && (
              <p className="text-xs text-gray-500 mt-1">
                Optional: Add a welcome message or next steps for the accepted applicant.
              </p>
            )}
            {action === 'rejected' && (
              <p className="text-xs text-red-600 mt-1">
                Required: Please provide constructive feedback explaining the reason for rejection.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={() => {
                if (processingAction) return
                setShowStatusModal(false)
                setSelectedApplication(null)
                setFeedback('')
                setAction(null)
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
                action === 'accepted'
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
                  {action === 'accepted' ? (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Accept Application</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span>Reject Application</span>
                    </>
                  )}
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Details Modal */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => {
          if (processingAction) return
          setShowDetailsModal(false)
          setSelectedApplication(null)
        }}
        title={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Application Details</h2>
              <p className="text-sm text-gray-500 mt-0.5">Review applicant information and CV</p>
            </div>
          </div>
        }
        size="large"
      >
        {selectedApplication && (
          <div className="space-y-6">
            {/* Applicant Info Card */}
            <div className="bg-gradient-to-br from-gray-50 to-blue-50 p-5 rounded-xl border border-gray-200">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-white">
                    {selectedApplication.profiles?.full_name?.[0]?.toUpperCase() || 'A'}
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg text-gray-900">{selectedApplication.profiles?.full_name || 'N/A'}</h3>
                  <p className="text-sm text-gray-600 mt-1">{selectedApplication.profiles?.email || ''}</p>
                  <div className="mt-3 flex items-center gap-2">
                    {getStatusBadge(selectedApplication.status)}
                    <span className="text-xs text-gray-500">
                      Applied {new Date(selectedApplication.applied_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Internship Info */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h4 className="text-sm font-semibold text-gray-700 mb-3 uppercase">Internship</h4>
              <p className="font-bold text-lg text-gray-900">{selectedApplication.internships?.title || 'N/A'}</p>
              {selectedApplication.internships?.description && (
                <p className="text-sm text-gray-600 mt-2">{selectedApplication.internships.description}</p>
              )}
            </div>

            {/* CV Summary */}
            {selectedApplication.cv_data && (
              <div className="bg-white border-2 border-blue-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    CV Summary
                  </h4>
                  <button
                    onClick={() => {
                      setShowDetailsModal(false)
                      setShowCVModal(true)
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    View Full CV
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedApplication.cv_data.personal && (
                    <>
                      <div>
                        <span className="text-xs font-semibold text-gray-500 uppercase">Contact</span>
                        <p className="text-sm font-medium text-gray-900 mt-1">
                          {selectedApplication.cv_data.personal.email || 'N/A'}
                        </p>
                        <p className="text-sm text-gray-600">{selectedApplication.cv_data.personal.phone || ''}</p>
                      </div>
                      {selectedApplication.cv_data.personal.address && (
                        <div>
                          <span className="text-xs font-semibold text-gray-500 uppercase">Address</span>
                          <p className="text-sm text-gray-900 mt-1">{selectedApplication.cv_data.personal.address}</p>
                        </div>
                      )}
                    </>
                  )}
                  {selectedApplication.cv_data.education && selectedApplication.cv_data.education.length > 0 && (
                    <div className="md:col-span-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase">Education</span>
                      <div className="mt-2 space-y-2">
                        {selectedApplication.cv_data.education.slice(0, 2).map((edu, idx) => (
                          <div key={idx} className="bg-gray-50 p-3 rounded-lg">
                            <p className="text-sm font-medium text-gray-900">{edu.degree || 'N/A'}</p>
                            <p className="text-sm text-gray-600">{edu.institution || ''}</p>
                            {edu.year && <p className="text-xs text-gray-500 mt-1">{edu.year}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedApplication.cv_data.skills && selectedApplication.cv_data.skills.length > 0 && (
                    <div className="md:col-span-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase">Skills</span>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedApplication.cv_data.skills.map((skill, idx) => (
                          <span key={idx} className="px-3 py-1 bg-blue-50 text-blue-800 rounded-md text-xs font-medium border border-blue-200">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedApplication.cv_data.experience && selectedApplication.cv_data.experience.length > 0 && (
                    <div className="md:col-span-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase">Experience</span>
                      <div className="mt-2 space-y-2">
                        {selectedApplication.cv_data.experience.slice(0, 2).map((exp, idx) => (
                          <div key={idx} className="bg-gray-50 p-3 rounded-lg">
                            <p className="text-sm font-medium text-gray-900">{exp.role || 'N/A'}</p>
                            <p className="text-sm text-gray-600">{exp.company || ''}</p>
                            {exp.duration && <p className="text-xs text-gray-500 mt-1">{exp.duration}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Feedback if reviewed */}
            {selectedApplication.feedback && (
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
                <h4 className="text-sm font-semibold text-yellow-800 mb-1">Review Feedback</h4>
                <p className="text-sm text-yellow-700">{selectedApplication.feedback}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              {selectedApplication.status === 'pending' && (
                <>
                  <button
                    onClick={() => {
                      setShowDetailsModal(false)
                      handleStatusUpdate(selectedApplication, 'accepted')
                    }}
                    disabled={processingAction}
                    className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-semibold hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Accept
                  </button>
                  <button
                    onClick={() => {
                      setShowDetailsModal(false)
                      handleStatusUpdate(selectedApplication, 'rejected')
                    }}
                    disabled={processingAction}
                    className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-lg font-semibold hover:from-red-700 hover:to-rose-700 transition-all shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Reject
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  if (processingAction) return
                  setShowDetailsModal(false)
                  setSelectedApplication(null)
                }}
                disabled={processingAction}
                className="px-6 py-2.5 border-2 border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function exportCsv(rows) {
  const headers = ['Applicant Name', 'Applicant Email', 'Internship Title', 'Status', 'Applied At']
  const lines = rows.map(r => [
    escapeCsv(r.profiles?.full_name || ''),
    escapeCsv(r.profiles?.email || ''),
    escapeCsv(r.internships?.title || ''),
    escapeCsv(r.status || ''),
    escapeCsv(new Date(r.applied_at).toISOString()),
  ].join(','))
  const csv = [headers.join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `applicants-${new Date().toISOString().slice(0,10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function escapeCsv(value) {
  const v = String(value || '')
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"'
  }
  return v
}