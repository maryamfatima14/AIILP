import React, { useEffect, useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import Table from '../components/Table'
import Spinner from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'

async function fetchApplications(userId, filters = {}) {
  console.log('[Applications] Fetching applications for user:', userId, 'Filters:', filters)

  // Try to fetch with feedback column
  let query = supabase
    .from('applications')
    .select(`
      id, status, applied_at, updated_at, internship_id, feedback,
      internships:internship_id (
        id,
        title,
        description,
        skills,
        duration,
        location,
        type,
        software_house:software_house_id (
          organization_name,
          full_name,
          email
        )
      )
    `)
    .eq('user_id', userId)
    .order('applied_at', { ascending: false })

  if (filters.status) {
    query = query.eq('status', filters.status)
  }

  const { data, error } = await query
  
  if (error) {
    console.error('[Applications] Error fetching with join:', error)
    
    // If error is about feedback column, try without it
    if (error.message?.includes('feedback') || error.message?.includes('column') && error.message?.includes('does not exist')) {
      console.log('[Applications] Feedback column missing, fetching without it...')
      
      // Retry without feedback column
      let queryWithoutFeedback = supabase
        .from('applications')
        .select(`
          id, status, applied_at, updated_at, internship_id,
          internships:internship_id (
            id,
            title,
            description,
            skills,
            duration,
            location,
            type,
            software_house:software_house_id (
              organization_name,
              full_name,
              email
            )
          )
        `)
        .eq('user_id', userId)
        .order('applied_at', { ascending: false })
      
      if (filters.status) {
        queryWithoutFeedback = queryWithoutFeedback.eq('status', filters.status)
      }
      
      const { data: dataWithoutFeedback, error: errorWithoutFeedback } = await queryWithoutFeedback
      
      if (errorWithoutFeedback) {
        // If still error, try without profile join too
        let fallbackQuery = supabase
          .from('applications')
          .select(`
            id, status, applied_at, updated_at, internship_id,
            internships:internship_id (
              id,
              title,
              description,
              skills,
              duration,
              location,
              type
            )
          `)
          .eq('user_id', userId)
          .order('applied_at', { ascending: false })
        
        if (filters.status) {
          fallbackQuery = fallbackQuery.eq('status', filters.status)
        }
        
        const { data: fallbackData, error: fallbackError } = await fallbackQuery
        if (fallbackError) {
          console.error('[Applications] Fallback query also failed:', fallbackError)
          throw fallbackError
        }
        
        // Add null profiles and feedback to match expected structure
        return (fallbackData || []).map(app => ({
          ...app,
          feedback: null, // Column doesn't exist yet
          internships: app.internships ? {
            ...app.internships,
            software_house: null
          } : null
        }))
      }
      
      // Add null feedback to match expected structure
      return (dataWithoutFeedback || []).map(app => ({
        ...app,
        feedback: null // Column doesn't exist yet
      }))
    }
    
    // If join fails (not feedback error), try without nested profile join
    let fallbackQuery = supabase
      .from('applications')
      .select(`
        id, status, applied_at, updated_at, internship_id, feedback,
        internships:internship_id (
          id,
          title,
          description,
          skills,
          duration,
          location,
          type
        )
      `)
      .eq('user_id', userId)
      .order('applied_at', { ascending: false })
    
    if (filters.status) {
      fallbackQuery = fallbackQuery.eq('status', filters.status)
    }
    
    const { data: fallbackData, error: fallbackError } = await fallbackQuery
    
    // If fallback also fails due to feedback, try without it
    if (fallbackError && (fallbackError.message?.includes('feedback') || (fallbackError.message?.includes('column') && fallbackError.message?.includes('does not exist')))) {
      let finalQuery = supabase
        .from('applications')
        .select(`
          id, status, applied_at, updated_at, internship_id,
          internships:internship_id (
            id,
            title,
              description,
            skills,
            duration,
            location,
            type
          )
        `)
        .eq('user_id', userId)
        .order('applied_at', { ascending: false })
      
      if (filters.status) {
        finalQuery = finalQuery.eq('status', filters.status)
      }
      
      const { data: finalData, error: finalError } = await finalQuery
      if (finalError) {
        console.error('[Applications] Final query also failed:', finalError)
        throw finalError
      }
      
      return (finalData || []).map(app => ({
        ...app,
        feedback: null,
        internships: app.internships ? {
          ...app.internships,
          software_house: null
        } : null
      }))
    }
    
    if (fallbackError) {
      console.error('[Applications] Fallback query also failed:', fallbackError)
      throw fallbackError
    }
    
    // Add null profiles to match expected structure
    return (fallbackData || []).map(app => ({
      ...app,
      internships: app.internships ? {
        ...app.internships,
        software_house: null
      } : null
    }))
  }
  
  console.log('[Applications] Fetched applications:', data?.length || 0)
  
  // Apply search filter in memory if needed (since we can't use ilike on nested relations)
  let filteredData = data || []
  if (filters.search && filters.search.trim()) {
    const searchLower = filters.search.toLowerCase().trim()
    filteredData = filteredData.filter(app => 
      app.internships?.title?.toLowerCase().includes(searchLower)
    )
  }
  
  return filteredData
}

export default function Applications() {
  const { profile, user } = useAuth()
  const [statusFilter, setStatusFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selected, setSelected] = useState(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [withdrawingId, setWithdrawingId] = useState(null)
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false)
  const [appToWithdraw, setAppToWithdraw] = useState(null)

  // Use user.id if profile.id is not available (for guest users)
  const userId = profile?.id || user?.id

  const filters = useMemo(() => ({
    status: statusFilter || undefined,
    search: searchTerm || undefined
  }), [statusFilter, searchTerm])

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['applications', userId, filters],
    queryFn: () => fetchApplications(userId, filters),
    enabled: !!userId,
    staleTime: 60000,
    cacheTime: 5 * 60 * 1000,
    retry: 2
  })

  // Log for debugging
  useEffect(() => {
    if (userId) {
      console.log('[Applications] Component mounted with userId:', userId, 'Profile:', profile, 'User:', user)
    } else {
      console.warn('[Applications] No userId available. Profile:', profile, 'User:', user)
    }
  }, [userId, profile, user])

  // Log query results
  useEffect(() => {
    if (data !== undefined) {
      console.log('[Applications] Query result:', {
        count: data?.length || 0,
        data: data,
        error: error
      })
    }
  }, [data, error])

  useEffect(() => {
    if (!userId) return
    
    const channel = supabase.channel('applications-user')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'applications',
        filter: `user_id=eq.${userId}`
      }, () => {
        console.log('[Applications] Realtime update received, refetching...')
        refetch()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, refetch])

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-amber-100 text-amber-800 border-amber-200',
      accepted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      rejected: 'bg-rose-100 text-rose-800 border-rose-200'
    }
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${styles[status] || 'bg-gray-100 text-gray-800 border-gray-200'}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  const openDetails = async (app) => {
    setSelected(app)
    setDetailsOpen(true)
    try {
      // Fetch with feedback included
      const { data: full, error } = await supabase
        .from('applications')
        .select(`
          id, status, applied_at, updated_at, internship_id, feedback,
          internships:internship_id (
            id,
            title,
            description,
            skills,
            duration,
            location,
            type,
            software_house:software_house_id (
              organization_name,
              full_name,
              email
            )
          )
        `)
        .eq('id', app.id)
        .single()
      
      if (error) {
        console.error('[Applications] Error fetching details:', error)
        // If error, try without feedback as fallback
        const { data: fullWithoutFeedback, error: error2 } = await supabase
          .from('applications')
          .select(`
            id, status, applied_at, updated_at, internship_id,
            internships:internship_id (
              id,
              title,
              description,
              skills,
              duration,
              location,
              type,
              software_house:software_house_id (
                organization_name,
                full_name,
                email
              )
            )
          `)
          .eq('id', app.id)
          .single()
        
        if (fullWithoutFeedback) {
          setSelected({ ...fullWithoutFeedback, feedback: null })
        } else if (error2) {
          console.error('[Applications] Fallback query also failed:', error2)
        }
      } else if (full) {
        setSelected(full)
      }
    } catch (e) {
      console.error('[Applications] Error fetching details:', e)
    }
  }

  const closeDetails = () => {
    setDetailsOpen(false)
    setSelected(null)
  }

  const handleWithdrawClick = (app) => {
    // Only allow withdrawal if status is pending
    if (app.status !== 'pending') {
      toast.error(`Cannot withdraw ${app.status} applications. Only pending applications can be withdrawn.`)
      return
    }
    setAppToWithdraw(app)
    setShowWithdrawConfirm(true)
  }

  const withdrawApplication = async () => {
    if (!appToWithdraw?.id) return

    try {
      setWithdrawingId(appToWithdraw.id)
      const { error } = await supabase
        .from('applications')
        .delete()
        .eq('id', appToWithdraw.id)

      if (error) throw error

      toast.success('Application withdrawn successfully')
      setShowWithdrawConfirm(false)
      setAppToWithdraw(null)
      closeDetails()
      await refetch()
    } catch (err) {
      toast.error(err.message || 'Unable to withdraw application. Please contact support.')
    } finally {
      setWithdrawingId(null)
    }
  }

  if (isLoading) return <Spinner />

  // Show error if query failed
  // Calculate stats for header (simple derived values, no hook)
  const stats = data
    ? {
        total: data.length,
        pending: data.filter(a => a.status === 'pending').length,
        accepted: data.filter(a => a.status === 'accepted').length,
        rejected: data.filter(a => a.status === 'rejected').length
      }
    : null

  return (
    <div>
      {/* Header aligned with Software House / Admin Dashboard (colored panel) */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-blue-600">My Applications</h1>
              <p className="text-xs md:text-sm text-gray-600 mt-1">
                {stats ? (
                  <>
                    Total: <span className="font-semibold text-gray-900">{stats.total}</span> • Pending:{' '}
                    <span className="font-semibold text-amber-600">{stats.pending}</span> • Accepted:{' '}
                    <span className="font-semibold text-emerald-600">{stats.accepted}</span> • Rejected:{' '}
                    <span className="font-semibold text-rose-600">{stats.rejected}</span>
                  </>
                ) : (
                  'Track and manage your internship applications'
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Show error if query failed */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center mb-6">
          <svg className="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-red-900 mb-2">Error Loading Applications</h3>
          <p className="text-red-700 mb-4">{error.message || 'Failed to load your applications. Please try again.'}</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search by Internship Title
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search internships..."
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Filter by Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Applications Table */}
      {!data || data.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-12 text-center">
          <svg className="w-20 h-20 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Applications Found</h3>
          <p className="text-gray-600 mb-4">
            {searchTerm || statusFilter
              ? 'Try adjusting your filters to find applications.'
              : "You haven't applied to any internships yet."
            }
          </p>
          {!searchTerm && !statusFilter && (
            <Link
              to="/listings"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition shadow-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Browse Internships
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      <Table
        columns={[
              {
                Header: 'Internship',
                accessor: (r) => (
                  <div className="flex items-start gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600 flex-shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h.01M8 3h8a2 2 0 012 2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2zm0 4h8" />
                      </svg>
                    </span>
                    <div className="flex flex-col min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{r.internships?.title || 'N/A'}</p>
                      <p className="text-xs text-gray-600 truncate">
                        {r.internships?.software_house?.organization_name ||
                          r.internships?.software_house?.full_name ||
                          r.internships?.software_house?.email ||
                          ''}
                      </p>
                    </div>
                  </div>
                )
              },
              {
                Header: 'Skills',
                accessor: (r) => (
                  <div className="flex flex-wrap gap-1.5">
                    {(r.internships?.skills || []).slice(0, 2).map((skill, idx) => (
                      <span key={idx} className="px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-200">
                        {skill}
                      </span>
                    ))}
                    {(r.internships?.skills || []).length > 2 && (
                      <span className="px-2.5 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                        +{(r.internships?.skills || []).length - 2}
                      </span>
                    )}
                  </div>
                )
              },
              {
                Header: 'Status',
                accessor: (r) => getStatusBadge(r.status)
              },
              {
                Header: 'Applied Date',
                accessor: (r) => (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm text-gray-700">{new Date(r.applied_at).toLocaleDateString()}</span>
                  </div>
                )
              },
              {
                Header: 'Updated',
                accessor: (r) => (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span className="text-sm text-gray-700">{new Date(r.updated_at).toLocaleDateString()}</span>
                  </div>
                )
              },
              {
                Header: 'Feedback',
                accessor: (r) => r.feedback ? (
                  <div className="flex items-start gap-2 max-w-xs">
                    <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                    <span className="text-sm text-gray-600 line-clamp-2">{r.feedback}</span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">-</span>
                )
              },
              {
                Header: 'Actions',
                accessor: (r) => {
                  const canWithdraw = r.status === 'pending'
                  return (
                    <div className="flex items-center gap-2">
                      <button
                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition shadow-sm flex items-center gap-2"
                        onClick={() => openDetails(r)}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        View
                      </button>
                      <button
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm text-sm font-medium flex items-center gap-2"
                        disabled={!canWithdraw || withdrawingId === r.id}
                        onClick={() => canWithdraw && handleWithdrawClick(r)}
                        title={!canWithdraw ? `Cannot withdraw ${r.status} applications` : 'Withdraw application'}
                      >
                        {withdrawingId === r.id ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                            </svg>
                            Withdrawing...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Withdraw
                          </>
                        )}
                      </button>
                    </div>
                  )
                }
              }
        ]}
        data={data || []}
      />
        </div>
      )}

      {/* Details Modal */}
      <Modal isOpen={detailsOpen} onClose={closeDetails} title="Application Details" size="large">
        {!selected ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-gray-600">No application selected.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header Section */}
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-6 border border-indigo-100">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h.01M8 3h8a2 2 0 012 2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2zm0 4h8" />
                      </svg>
                    </span>
                    <h4 className="text-2xl font-bold text-gray-900">{selected.internships?.title || 'N/A'}</h4>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span className="text-sm font-medium">
                      {selected.internships?.software_house?.organization_name ||
                        selected.internships?.software_house?.full_name ||
                        selected.internships?.software_house?.email ||
                        'Unknown Company'}
                    </span>
                  </div>
                </div>
                <div>{getStatusBadge(selected.status)}</div>
              </div>
            </div>

            {/* Description Section */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h5 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
                Description
              </h5>
              <p className="text-gray-700 whitespace-pre-line leading-relaxed">{selected.internships?.description || 'No description provided.'}</p>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Skills Section */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h5 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Required Skills
                </h5>
                <div className="flex flex-wrap gap-2">
                  {(selected.internships?.skills || []).map((skill, idx) => (
                    <span key={idx} className="px-3 py-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 rounded-full text-xs font-medium border border-blue-200">
                      {skill}
                    </span>
                  ))}
                  {(selected.internships?.skills || []).length === 0 && (
                    <span className="text-gray-500 text-sm">No skills listed</span>
                  )}
                </div>
              </div>

              {/* Details Section */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h5 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Details
                </h5>
                <div className="space-y-3">
                  {selected.internships?.duration && (
                    <div className="flex items-center gap-2 text-sm">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3A9 9 0 113 12a9 9 0 0118 0z" />
                      </svg>
                      <span className="text-gray-600"><span className="font-medium text-gray-900">Duration:</span> {selected.internships.duration}</span>
                    </div>
                  )}
                  {selected.internships?.location && (
                    <div className="flex items-center gap-2 text-sm">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0L6.343 16.657A8 8 0 1117.657 16.657z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="text-gray-600"><span className="font-medium text-gray-900">Location:</span> {selected.internships.location}</span>
                    </div>
                  )}
                  {selected.internships?.type && (
                    <div className="flex items-center gap-2 text-sm">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <span className="text-gray-600"><span className="font-medium text-gray-900">Type:</span> <span className="capitalize">{selected.internships.type}</span></span>
                    </div>
                  )}
                  {selected.internships?.stipend && (
                    <div className="flex items-center gap-2 text-sm">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-gray-600"><span className="font-medium text-gray-900">Stipend:</span> ${selected.internships.stipend}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm pt-2 border-t border-gray-200">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-gray-600"><span className="font-medium text-gray-900">Applied:</span> {new Date(selected.applied_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span className="text-gray-600"><span className="font-medium text-gray-900">Updated:</span> {new Date(selected.updated_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Feedback Section */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h5 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                Feedback from Software House
              </h5>
              {selected.feedback ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-gray-800 leading-relaxed">{selected.feedback}</p>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                  <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  <p className="text-gray-500 text-sm">No feedback has been provided yet.</p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-6">
              <button
                className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition font-medium shadow-sm"
                onClick={closeDetails}
              >
                Close
              </button>
              {selected.status === 'pending' ? (
                <button
                  className="px-6 py-2.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium shadow-sm flex items-center gap-2"
                  disabled={withdrawingId === selected.id}
                  onClick={() => handleWithdrawClick(selected)}
                >
                  {withdrawingId === selected.id ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                      </svg>
                      Withdrawing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Withdraw Application
                    </>
                  )}
                </button>
              ) : (
                <div className="px-6 py-2.5 rounded-lg bg-gray-100 text-gray-500 font-medium shadow-sm flex items-center gap-2 cursor-not-allowed">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  Withdrawal Not Available
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Withdraw Confirmation Modal */}
      <Modal isOpen={showWithdrawConfirm} onClose={() => { setShowWithdrawConfirm(false); setAppToWithdraw(null) }} title="Confirm Withdrawal" size="small">
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Withdraw Application?</h3>
              <p className="text-gray-600 mb-1">
                Are you sure you want to withdraw your application for:
              </p>
              <p className="text-sm font-medium text-gray-900 bg-gray-50 rounded-lg p-3 border border-gray-200">
                {appToWithdraw?.internships?.title || 'This internship'}
              </p>
              <p className="text-sm text-gray-600 mt-3">
                This action cannot be undone. You will need to apply again if you change your mind.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
            <button
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition font-medium"
              onClick={() => { setShowWithdrawConfirm(false); setAppToWithdraw(null) }}
              disabled={withdrawingId === appToWithdraw?.id}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium flex items-center gap-2"
              onClick={withdrawApplication}
              disabled={withdrawingId === appToWithdraw?.id}
            >
              {withdrawingId === appToWithdraw?.id ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                  Withdrawing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Yes, Withdraw
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}