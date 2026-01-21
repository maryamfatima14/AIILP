import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../hooks/useNotifications'
import Spinner from '../../components/Spinner'
import Modal from '../../components/Modal'
import CVPreview from '../CVPreview'
import toast from 'react-hot-toast'

async function fetchSoftwareHouseStats(softwareHouseId) {
  const [internships, applications] = await Promise.all([
    supabase.from('internships').select('*', { count: 'exact', head: true }).eq('software_house_id', softwareHouseId),
    supabase.from('applications').select('status').in('internship_id', 
      (await supabase.from('internships').select('id').eq('software_house_id', softwareHouseId)).data?.map(i => i.id) || []
    )
  ])

  const appData = applications.data || []
  const pending = appData.filter(a => a.status === 'pending').length

  return {
    totalPostings: internships.count || 0,
    totalApplicants: appData.length,
    pendingReviews: pending
  }
}

export default function SoftwareHouseDashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { unreadCount } = useNotifications()
  const { data: stats, isLoading } = useQuery({
    queryKey: ['software-house-stats', profile?.id],
    queryFn: () => fetchSoftwareHouseStats(profile.id),
    enabled: !!profile?.id
  })

  // Recent applicants
  const fetchRecentApplicants = async () => {
    const { data: internships } = await supabase
      .from('internships')
      .select('id')
      .eq('software_house_id', profile.id)

    const internshipIds = internships?.map(i => i.id) || []
    if (!internshipIds.length) return []

    const { data, error } = await supabase
      .from('applications')
      .select(`
        *,
        internships:internship_id (
          id,
          title
        ),
        profiles:user_id (
          id,
          full_name,
          email
        )
      `)
      .in('internship_id', internshipIds)
      .order('applied_at', { ascending: false })
      .limit(5)
    if (error) throw error
    return data || []
  }

  const { data: applicants } = useQuery({
    queryKey: ['software-house-recent', profile?.id],
    queryFn: fetchRecentApplicants,
    enabled: !!profile?.id
  })

  // Quick post form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [skills, setSkills] = useState('')
  const [duration, setDuration] = useState('')
  const [location, setLocation] = useState('')
  const [type, setType] = useState('')
  const [showCVModal, setShowCVModal] = useState(false)
  const [selectedApplication, setSelectedApplication] = useState(null)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [action, setAction] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [processingAction, setProcessingAction] = useState(false)

  const quickPost = useMutation({
    mutationFn: async () => {
      const skillArray = (skills || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
      const { error } = await supabase
        .from('internships')
        .insert({
          software_house_id: profile.id,
          title: title?.trim() || 'Untitled Internship',
          description: description?.trim() || null,
          skills: skillArray,
          duration: duration?.trim() || null,
          location: location?.trim() || null,
          type: type || null,
          status: 'pending'
        })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Internship posted for review')
      setTitle('')
      setDescription('')
      setSkills('')
      setDuration('')
      setLocation('')
      setType('')
      queryClient.invalidateQueries(['software-house-stats', profile?.id])
    },
    onError: (err) => toast.error(err.message)
  })

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      accepted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800'
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {status?.charAt(0)?.toUpperCase() + status?.slice(1)}
      </span>
    )
  }

  const handleStatusUpdate = (application, status) => {
    setSelectedApplication(application)
    setAction(status)
    setShowStatusModal(true)
  }

  const handleConfirmStatusUpdate = async () => {
    if (processingAction) return
    if (action === 'rejected' && !feedback.trim()) {
      return toast.error('Please provide feedback for rejection')
    }

    try {
      setProcessingAction(true)
      const updateData = { 
        status: action,
        updated_at: new Date().toISOString()
      }
      
      if (feedback && feedback.trim()) {
        updateData.feedback = feedback.trim()
      } else if (action === 'rejected') {
        updateData.feedback = 'Application has been rejected.'
      }

      const { error } = await supabase
        .from('applications')
        .update(updateData)
        .eq('id', selectedApplication.id)

      if (error) throw error

      const message = action === 'accepted' 
        ? 'Application accepted successfully!' 
        : 'Application rejected successfully!'
      toast.success(message)
      setShowStatusModal(false)
      setSelectedApplication(null)
      setFeedback('')
      setAction(null)
      queryClient.invalidateQueries(['software-house-recent', profile?.id])
      queryClient.invalidateQueries(['software-house-stats', profile?.id])
    } catch (error) {
      console.error('[Dashboard] Error updating status:', error)
      toast.error(error.message || 'Failed to update application status. Please try again.')
    } finally {
      setProcessingAction(false)
    }
  }

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-6">
      {/* Header aligned with Admin Dashboard (colored panel) */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-blue-600">Dashboard</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage your internships, review applications, and track your posting performance.
            </p>
          </div>
          {/* Right side - Notification and Action Button */}
          <div className="flex items-center gap-3">
            {/* Notification bell with count */}
            <button
              type="button"
              onClick={() => navigate('/software-house/notifications')}
              className="relative inline-flex items-center justify-center w-10 h-10 rounded-lg text-gray-600 hover:bg-indigo-100 transition-colors border border-indigo-200"
              aria-label="Notifications"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold text-white bg-red-500 rounded-full border-2 border-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            <Link
              to="/internships/new"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Internship
        </Link>
          </div>
        </div>
      </div>

      {/* Key Metrics - Same style as Admin Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Postings (blue) */}
        <div className="rounded-xl shadow p-6 text-white bg-gradient-to-br from-blue-600 to-blue-500">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-white/90">Total Postings</h3>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-3xl font-bold">{stats?.totalPostings || 0}</p>
          <p className="text-sm text-white/80 mt-1">Active Internships</p>
        </div>

        {/* Total Applicants (purple) */}
        <div className="rounded-xl shadow p-6 text-white bg-gradient-to-br from-purple-500 to-purple-600">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-white/90">Total Applicants</h3>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <p className="text-3xl font-bold">{stats?.totalApplicants || 0}</p>
          <p className="text-sm text-white/80 mt-1">All Applications</p>
        </div>

        {/* Pending Reviews (green) */}
        <div className="rounded-xl shadow p-6 text-white bg-gradient-to-br from-green-600 to-green-500">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-white/90">Pending Reviews</h3>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-3xl font-bold">{stats?.pendingReviews || 0}</p>
          <p className="text-sm text-white/80 mt-1">Awaiting Review</p>
        </div>
      </div>

      {/* Two-column content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Quick Post Form */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          {/* Header with gradient */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white">Post an Internship</h3>
            </div>
          </div>
          
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Frontend Developer Intern"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the internship role and responsibilities."
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-28 resize-none transition"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Skills
                </label>
                <input
                  type="text"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder="React, TypeScript"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Duration
                </label>
                <input
                  type="text"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="e.g., 3 months"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Location
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Remote, NY"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                >
                  <option value="">Select type</option>
                  <option value="full-time">Full-Time</option>
                  <option value="part-time">Part-Time</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
            </div>
            <button
              onClick={() => quickPost.mutate()}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 font-semibold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={quickPost.isLoading}
            >
              {quickPost.isLoading ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Posting…
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Post Internship
                </>
              )}
            </button>
          </div>
        </div>

        {/* Recent Applicants */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          {/* Header with gradient */}
          <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white">Recent Applicants</h3>
              </div>
              <Link 
                to="/applications/manage" 
                className="text-sm text-white/90 hover:text-white font-medium flex items-center gap-1 transition"
              >
                Manage all
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
        </Link>
            </div>
          </div>
          
          <div className="p-6">
            {!applicants || applicants.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="text-gray-600 font-medium">No applications yet</p>
                <p className="text-sm text-gray-500 mt-1">Applications will appear here when candidates apply</p>
              </div>
            ) : (
              <div className="space-y-4">
                {applicants.map((r) => (
                  <div
                    key={r.id}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow duration-200"
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: Applicant Info */}
                      <div className="flex items-start gap-4 flex-1">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-lg">
                            {r.profiles?.full_name?.charAt(0) || 'A'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-gray-900">{r.profiles?.full_name || 'N/A'}</p>
                            {getStatusBadge(r.status)}
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{r.profiles?.email || ''}</p>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                            <span className="truncate">{r.internships?.title || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => { setSelectedApplication(r); setShowCVModal(true) }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          View CV
                        </button>
                        {r.status === 'pending' && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleStatusUpdate(r, 'accepted')}
                              className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition"
                              title="Accept"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleStatusUpdate(r, 'rejected')}
                              className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition"
                              title="Reject"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        )}
                        {r.status !== 'pending' && (
                          <span className="text-xs text-gray-500">Reviewed</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CV Preview Modal */}
      <Modal
        isOpen={showCVModal}
        onClose={() => { setShowCVModal(false); setSelectedApplication(null) }}
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

          {/* Feedback Section */}
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
              onClick={handleConfirmStatusUpdate}
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
    </div>
  )
}