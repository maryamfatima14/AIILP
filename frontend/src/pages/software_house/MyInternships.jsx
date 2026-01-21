import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../context/AuthContext'
import Spinner from '../../components/Spinner'
import Modal from '../../components/Modal'
import toast from 'react-hot-toast'

async function fetchMine(userId) {
  const { data, error } = await supabase
    .from('internships')
    .select('*')
    .eq('software_house_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export default function MyInternships() {
  const { profile } = useAuth()
  const [statusFilter, setStatusFilter] = useState('all') // 'all', 'pending', 'approved', 'rejected'
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [internshipToDelete, setInternshipToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const { data, isLoading, refetch } = useQuery({ 
    queryKey: ['internships', 'mine', profile?.id], 
    queryFn: () => fetchMine(profile.id), 
    enabled: !!profile?.id 
  })

  const handleDeleteClick = (internship) => {
    setInternshipToDelete(internship)
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = async () => {
    if (!internshipToDelete) return
    try {
      setDeleting(true)
      const { error } = await supabase.from('internships').delete().eq('id', internshipToDelete.id)
      if (error) {
        toast.error(error.message)
        return
      }
      toast.success('Internship deleted successfully')
      setShowDeleteConfirm(false)
      setInternshipToDelete(null)
      refetch()
    } catch (error) {
      toast.error(error.message || 'Failed to delete internship')
    } finally {
      setDeleting(false)
    }
  }

  const getStatusBadge = (status) => {
    const styles = {
      approved: 'bg-gradient-to-r from-green-500 to-emerald-600 text-white',
      pending: 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white',
      rejected: 'bg-gradient-to-r from-red-500 to-rose-600 text-white'
    }
    return styles[status] || 'bg-gray-500 text-white'
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    })
  }

  if (isLoading) return <Spinner />
  
  // Show all internships (pending, approved, and rejected)
  const allInternships = data || []
  const approvedCount = allInternships.filter(i => i.status === 'approved').length
  const pendingCount = allInternships.filter(i => i.status === 'pending').length
  const rejectedCount = allInternships.filter(i => i.status === 'rejected').length
  const totalCount = allInternships.length
  
  // Filter internships based on selected status
  const internships = statusFilter === 'all' 
    ? allInternships 
    : allInternships.filter(i => i.status === statusFilter)

  return (
    <div className="space-y-6">
      {/* Header aligned with Admin Dashboard (colored panel) */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-blue-600">My Internships</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage and view all your posted internship opportunities
            </p>
          </div>
          {/* Right side - Statistics Cards */}
          <div className="flex flex-wrap gap-3">
            {/* Approved Posts Card - Highlighted */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg shadow-sm border-2 border-green-200 px-5 py-4 min-w-[120px]">
              <div className="text-xs text-green-700 font-semibold mb-1 uppercase tracking-wide">Approved</div>
              <div className="text-3xl font-bold text-green-600">{approvedCount}</div>
              <div className="text-xs text-green-600 mt-1">Active Posts</div>
            </div>
            
            {/* Total Posts Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-3 min-w-[100px]">
              <div className="text-xs text-gray-500 font-medium mb-1">Total Posts</div>
              <div className="text-2xl font-bold text-gray-900">{totalCount}</div>
            </div>
            
            {/* Pending Posts Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-3 min-w-[100px]">
              <div className="text-xs text-gray-500 font-medium mb-1">Pending</div>
              <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
            </div>
            
            {/* Rejected Posts Card */}
            <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-lg shadow-sm border-2 border-red-200 px-4 py-3 min-w-[100px]">
              <div className="text-xs text-red-700 font-semibold mb-1 uppercase tracking-wide">Rejected</div>
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

      {/* Internships Grid - Post Style Cards */}
      {internships.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <svg className="w-20 h-20 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {statusFilter === 'all' 
              ? 'No Internships Yet' 
              : statusFilter === 'pending'
              ? 'No Pending Internships'
              : statusFilter === 'approved'
              ? 'No Approved Internships'
              : 'No Rejected Internships'}
          </h3>
          <p className="text-gray-600 mb-6">
            {statusFilter === 'all' 
              ? 'Start posting internships to attract talented candidates' 
              : `No ${statusFilter} internships found.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {internships.map((internship, index) => {
            // Different gradient colors for each post
            const gradients = [
              'from-blue-500 via-indigo-600 to-purple-700',
              'from-emerald-500 via-teal-600 to-cyan-700',
              'from-pink-500 via-rose-600 to-red-700',
              'from-amber-500 via-orange-600 to-yellow-700',
              'from-violet-500 via-purple-600 to-fuchsia-700',
              'from-green-500 via-emerald-600 to-teal-700',
              'from-sky-500 via-blue-600 to-indigo-700',
              'from-rose-500 via-pink-600 to-red-700',
              'from-lime-500 via-green-600 to-emerald-700',
            ]
            const gradientClass = gradients[index % gradients.length]
            
            return (
            <div
              key={internship.id}
              className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden hover:shadow-xl transition-shadow duration-300"
            >
              {/* Image Container */}
              <div className={`relative h-48 bg-gradient-to-br ${gradientClass} overflow-hidden`}>
                <div className="absolute inset-0 bg-black/20"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-white">
                    <svg className="w-16 h-16 mx-auto mb-2 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm font-medium opacity-90">Internship Opportunity</p>
                  </div>
                </div>
                {/* Status Badge */}
                <div className="absolute top-4 right-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold shadow-lg ${getStatusBadge(internship.status)}`}>
                    {internship.status.charAt(0).toUpperCase() + internship.status.slice(1)}
                  </span>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                {/* Title and Date */}
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-2">{internship.title}</h3>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>Posted {formatDate(internship.created_at)}</span>
                    </div>
                    {internship.approved_at && (
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Approved {formatDate(internship.approved_at)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-gray-700 mb-4 line-clamp-3">{internship.description}</p>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {internship.location && (
                    <div className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <div>
                        <div className="text-xs text-gray-500">Location</div>
                        <div className="text-sm font-medium text-gray-900">{internship.location}</div>
                      </div>
                    </div>
                  )}
                  {internship.duration && (
                    <div className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <div className="text-xs text-gray-500">Duration</div>
                        <div className="text-sm font-medium text-gray-900">{internship.duration}</div>
                      </div>
                    </div>
                  )}
                  {internship.type && (
                    <div className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <div>
                        <div className="text-xs text-gray-500">Type</div>
                        <div className="text-sm font-medium text-gray-900 capitalize">{internship.type}</div>
                      </div>
                    </div>
                  )}
                  {internship.stipend && (
                    <div className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <div className="text-xs text-gray-500">Stipend</div>
                        <div className="text-sm font-medium text-gray-900">${internship.stipend}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Skills */}
                {internship.skills && internship.skills.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs text-gray-500 mb-2">Required Skills</div>
                    <div className="flex flex-wrap gap-2">
                      {internship.skills.slice(0, 5).map((skill, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-200"
                        >
                          {skill}
                        </span>
                      ))}
                      {internship.skills.length > 5 && (
                        <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                          +{internship.skills.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                  <div className="text-xs text-gray-500">
                    ID: {internship.id.slice(0, 8)}...
                  </div>
                  <div className="flex items-center gap-2">
                    {internship.status === 'pending' && (
                      <button
                        onClick={() => handleDeleteClick(internship)}
                        className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                      </button>
                    )}
                    {internship.status === 'approved' && (
                      <span className="px-4 py-2 bg-green-50 text-green-600 rounded-lg text-sm font-medium flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Active
                      </span>
                    )}
                    {internship.status === 'rejected' && (
                      <span className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Rejected
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Show feedback if rejected */}
                {internship.status === 'rejected' && internship.feedback && (
                  <div className="mt-4 pt-4 border-t border-red-200">
                    <div className="bg-red-50 border-l-4 border-red-400 p-3 rounded-r-lg">
                      <div className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div>
                          <div className="text-xs font-semibold text-red-800 mb-1">Rejection Feedback</div>
                          <p className="text-sm text-red-700">{internship.feedback}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            )
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false)
          setInternshipToDelete(null)
        }}
        title="Delete Internship"
        size="small"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-700 mb-2">
                Are you sure you want to <strong className="text-red-600">delete</strong> this internship? This action cannot be undone.
              </p>
              {internshipToDelete && (
                <div className="bg-gray-50 rounded-lg p-3 mt-3">
                  <p className="text-sm font-semibold text-gray-900">{internshipToDelete.title}</p>
                  {internshipToDelete.description && (
                    <p className="text-xs text-gray-600 mt-1 line-clamp-2">{internshipToDelete.description}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Status: <span className="capitalize">{internshipToDelete.status}</span>
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={() => {
                setShowDeleteConfirm(false)
                setInternshipToDelete(null)
              }}
              disabled={deleting}
              className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-red-600 to-rose-600 text-white font-semibold hover:from-red-700 hover:to-rose-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Deleting...
                </span>
              ) : (
                'Delete Internship'
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}