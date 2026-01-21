import React, { useMemo, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../hooks/useNotifications'
import Spinner from '../../components/Spinner'
import Card from '../../components/Card'
import Table from '../../components/Table'
import toast from 'react-hot-toast'
import { getProfilePictureUrl } from '../../utils/api'
import ProfilePictureModal from '../../components/ProfilePictureModal'

async function fetchStudentStats(userId) {
  const { data: applications, error } = await supabase
    .from('applications')
    .select('status')
    .eq('user_id', userId)

  if (error) throw error

  return {
    total: applications?.length || 0,
    pending: applications?.filter(a => a.status === 'pending').length || 0,
    accepted: applications?.filter(a => a.status === 'accepted').length || 0,
    rejected: applications?.filter(a => a.status === 'rejected').length || 0
  }
}

export default function StudentDashboard() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { unreadCount } = useNotifications()
  const { data: stats, isLoading } = useQuery({
    queryKey: ['student-stats', profile?.id],
    queryFn: () => fetchStudentStats(profile.id),
    enabled: !!profile?.id
  })

  // Internships section state and data
  const { data: internships, isLoading: loadingInternships, refetch: refetchInternships, error: internshipsError } = useQuery({
    queryKey: ['internships', 'approved'],
    queryFn: async () => {
      console.log('[Student Dashboard] Starting to fetch internships...')
      
      // First, try without join to see if basic query works
      const { data: basicData, error: basicError } = await supabase
        .from('internships')
        .select('*')
        .eq('status', 'approved')
      
      console.log('[Student Dashboard] Basic query result:', {
        count: basicData?.length || 0,
        error: basicError,
        sample: basicData?.[0]
      })
      
      if (basicError) {
        console.error('[Student Dashboard] Basic query error:', basicError)
        throw basicError
      }
      
      // Now try with join
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
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
      
      if (error) {
        console.error('[Student Dashboard] Error fetching internships with join:', error)
        // If join fails, return basic data without profiles
        if (basicData && basicData.length > 0) {
          console.warn('[Student Dashboard] Join failed, returning data without profiles')
          return basicData.map(item => ({ ...item, profiles: null }))
        }
        throw error
      }
      
      console.log('[Student Dashboard] Fetched internships:', {
        count: data?.length || 0,
        withProfiles: data?.filter(i => i.profiles).length || 0,
        sample: data?.[0]
      })
      
      return data || []
    },
    retry: 2,
    staleTime: 30000 // Cache for 30 seconds
  })

  const [term, setTerm] = useState('') // kept for now but not shown in UI
  const [skillsFilter, setSkillsFilter] = useState('') // kept for potential future use
  const [durationFilter, setDurationFilter] = useState('') // kept for potential future use
  const [typeFilter, setTypeFilter] = useState('') // kept for potential future use
  const [showModal, setShowModal] = useState(false)
  const [applyingId, setApplyingId] = useState(null)

  const filteredInternships = useMemo(() => {
    let result = internships || []
    const t = term.trim().toLowerCase()

    if (t) {
      result = result.filter((i) =>
        [i.title, i.description, (i.skills || []).join(', ')].some((f) =>
          (f || '').toLowerCase().includes(t)
        )
      )
    }

    if (skillsFilter) {
      const filterSkills = skillsFilter.split(',').map(s => s.trim().toLowerCase())
      result = result.filter((i) =>
        (i.skills || []).some(skill =>
          filterSkills.some(fs => skill.toLowerCase().includes(fs))
        )
      )
    }

    if (durationFilter) {
      result = result.filter((i) =>
        i.duration?.toLowerCase().includes(durationFilter.toLowerCase())
      )
    }

    if (typeFilter) {
      result = result.filter((i) => (i.type || '').toLowerCase().includes(typeFilter.toLowerCase()))
    }

    return result
  }, [internships, term, skillsFilter, durationFilter, typeFilter])

  // Applications data (mini table)
  const { data: applications, isLoading: loadingApplications, refetch: refetchApplications } = useQuery({
    queryKey: ['applications', profile?.id, 'dashboard-mini'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          *,
          internships:internship_id (
            id,
            title,
            software_house:software_house_id (
              organization_name,
              full_name,
              email
            )
          )
        `)
        .eq('user_id', profile.id)
        .order('applied_at', { ascending: false })
        .limit(5)
      if (error) throw error
      return data || []
    },
    enabled: !!profile?.id
  })

  useEffect(() => {
    const channel = supabase.channel('applications-user-dashboard')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'applications',
        filter: `user_id=eq.${profile?.id}`
      }, () => {
        refetchApplications()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.id, refetchApplications])

  const checkCVComplete = async (userId) => {
    const { data, error } = await supabase
      .from('cv_forms')
      .select('is_complete')
      .eq('user_id', userId)
      .single()
    if (error && error.code !== 'PGRST116') throw error
    return data?.is_complete || false
  }

  const apply = async (internshipId) => {
    if (!profile?.id) {
      toast.error('Please login to apply')
      navigate('/login')
      return
    }

    const cvComplete = await checkCVComplete(profile.id)
    if (!cvComplete) {
      toast.error('Please complete your CV Form before applying')
      navigate('/cv')
      return
    }

    try {
      setApplyingId(internshipId)

      const { data: existing } = await supabase
        .from('applications')
        .select('id')
        .eq('user_id', profile.id)
        .eq('internship_id', internshipId)
        .maybeSingle()

      if (existing) {
        toast.error('You have already applied for this internship')
        return
      }

      // Fetch CV data to include in application
      const { data: cvData, error: cvError } = await supabase
        .from('cv_forms')
        .select('*')
        .eq('user_id', profile.id)
        .single()

      if (cvError || !cvData) {
        toast.error('CV data not found. Please complete your CV Form.')
        navigate('/cv')
        return
      }

      // Apply with CV data
      const { error } = await supabase
        .from('applications')
        .insert({
          user_id: profile.id,
          internship_id: internshipId,
          status: 'pending',
          cv_data: cvData
        })

      if (error) {
        if (error.code === '23505') {
          toast.error('You have already applied for this internship')
        } else {
          toast.error(error.message)
        }
        return
      }

      toast.success('Applied successfully!')
      refetchInternships()
      refetchApplications()
    } finally {
      setApplyingId(null)
    }
  }

  // Show error if internships query failed
  if (internshipsError) {
    console.error('[Student Dashboard] Internships error:', internshipsError)
  }

  if (isLoading || loadingInternships || loadingApplications) return <Spinner />

  return (
    <div className="space-y-6">
      {/* Header aligned with Software House / Admin Dashboard (colored panel) */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            {profile?.profile_picture ? (
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="focus:outline-none relative"
                aria-label="Preview profile picture"
                title={profile?.email || ''}
              >
                <img
                  src={getProfilePictureUrl(profile.profile_picture)}
                  alt="Profile"
                  className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover border-2 border-indigo-200 shadow"
                  onError={(e) => {
                    // Hide broken image and show fallback
                    e.currentTarget.style.display = 'none'
                    const fallback = e.currentTarget.nextElementSibling
                    if (fallback) fallback.style.display = 'flex'
                  }}
                />
                <div className="w-12 h-12 md:w-14 md:h-14 bg-indigo-100 rounded-full flex items-center justify-center border-2 border-indigo-200 hidden">
                  <span className="text-xl md:text-2xl font-bold text-indigo-700">
                    {profile?.full_name?.charAt(0) || (user?.email?.charAt(0)?.toUpperCase() || 'U')}
                  </span>
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="w-12 h-12 md:w-14 md:h-14 bg-indigo-100 rounded-full flex items-center justify-center focus:outline-none border-2 border-indigo-200"
                aria-label="Preview profile picture"
                title={profile?.email || ''}
              >
                <span className="text-xl md:text-2xl font-bold text-indigo-700">
                  {profile?.full_name?.charAt(0) || (user?.email?.charAt(0)?.toUpperCase() || 'U')}
                </span>
              </button>
            )}
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-blue-600">
                Dashboard
              </h1>
              <p className="text-xs md:text-sm text-gray-600 mt-1">
                Welcome {profile?.full_name || 'back'}, track your applications and discover new internships.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            {/* Notification bell with count */}
            <button
              type="button"
              onClick={() => navigate(profile?.role === 'guest' ? '/guest/notifications' : '/student/notifications')}
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
              to="/cv"
              className="px-4 py-2 rounded-lg border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 transition text-sm font-medium"
            >
              Edit Profile / CV
            </Link>
            <Link
              to="/cv"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-semibold shadow-sm"
            >
              Open CV Builder
        </Link>
          </div>
        </div>
      </div>

      {/* Available Internships */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b bg-gradient-to-r from-indigo-50 to-slate-50">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600/10 text-indigo-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
              </svg>
            </span>
            <div>
              <h2 className="text-base md:text-lg font-semibold text-slate-900">Available Internships</h2>
              <p className="text-xs md:text-sm text-slate-500 mt-0.5">Recommended opportunities for you</p>
            </div>
          </div>
          <Link
            to="/listings"
            className="text-xs md:text-sm font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
          >
            View all
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
        </Link>
        </div>

        {/* Error / Empty / Cards */}
        <div className="p-4 md:p-6">
          {internshipsError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start gap-3">
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12A9 9 0 113 12a9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-red-800">Error loading internships</h4>
                <p className="text-xs md:text-sm text-red-600 mt-1">
                  {internshipsError.message || 'Failed to load internships. Please refresh the page.'}
                </p>
                <button
                  onClick={() => refetchInternships()}
                  className="mt-3 inline-flex items-center px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {filteredInternships.length === 0 && !internshipsError && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <svg className="w-14 h-14 text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <h3 className="text-sm md:text-base font-semibold text-slate-900 mb-1">No internships available</h3>
              <p className="text-xs md:text-sm text-slate-500">
                Check back later or explore other opportunities on the platform.
              </p>
            </div>
          )}

          {filteredInternships.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredInternships.slice(0, 3).map((i, index) => {
                const alreadyApplied = (applications || []).some(a => a.internship_id === i.id)
                const isProcessing = applyingId === i.id
                const disabled = isProcessing || alreadyApplied
                
                // Different gradient colors for each post (same as software house)
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
                    key={i.id}
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
                        <span className="px-3 py-1 rounded-full text-xs font-semibold shadow-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white">
                          Approved
                        </span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                      {/* Title and Company */}
                      <div className="mb-4">
                        <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-2">{i.title}</h3>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            <span>{i.profiles?.organization_name || i.profiles?.full_name || 'Software House'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-gray-700 mb-4 line-clamp-3">{i.description}</p>

                      {/* Details Grid */}
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        {i.location && (
                          <div className="flex items-start gap-2">
                            <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <div>
                              <div className="text-xs text-gray-500">Location</div>
                              <div className="text-sm font-medium text-gray-900">{i.location}</div>
                            </div>
                          </div>
                        )}
                        {i.duration && (
                          <div className="flex items-start gap-2">
                            <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                              <div className="text-xs text-gray-500">Duration</div>
                              <div className="text-sm font-medium text-gray-900">{i.duration}</div>
                            </div>
                          </div>
                        )}
                        {i.type && (
                          <div className="flex items-start gap-2">
                            <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            <div>
                              <div className="text-xs text-gray-500">Type</div>
                              <div className="text-sm font-medium text-gray-900 capitalize">{i.type}</div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Skills */}
                      {i.skills && i.skills.length > 0 && (
                        <div className="mb-4">
                          <div className="text-xs text-gray-500 mb-2">Required Skills</div>
                          <div className="flex flex-wrap gap-2">
                            {i.skills.slice(0, 5).map((skill, idx) => (
                              <span
                                key={idx}
                                className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-200"
                              >
                                {skill}
                              </span>
                            ))}
                            {i.skills.length > 5 && (
                              <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                                +{i.skills.length - 5} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Apply Button */}
                      <div className="pt-4 border-t border-gray-200">
                        <button
                          onClick={() => !disabled && apply(i.id)}
                          disabled={disabled}
                          className={`w-full px-4 py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 ${
                            alreadyApplied
                              ? 'bg-gray-100 text-gray-600 cursor-not-allowed'
                              : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed'
                          }`}
                        >
                          {isProcessing ? (
                            <>
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                              </svg>
                              Applying...
                            </>
                          ) : alreadyApplied ? (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Already Applied
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              Apply Now
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* My Internships (mini table) */}
      <div className="bg-white rounded-xl shadow-lg border border-indigo-100 overflow-hidden mt-6">
        <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b bg-indigo-50">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h.01M8 3h8a2 2 0 012 2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2zm0 4h8" />
              </svg>
            </span>
            <div>
              <h3 className="text-base md:text-lg font-semibold text-blue-600">My Internships</h3>
              {stats && (
                <p className="text-xs md:text-sm text-gray-600 mt-0.5">
                  Total: <span className="font-semibold text-gray-900">{stats.total}</span> • Pending:{' '}
                  <span className="font-semibold text-amber-600">{stats.pending}</span> • Accepted:{' '}
                  <span className="font-semibold text-emerald-600">{stats.accepted}</span> • Rejected:{' '}
                  <span className="font-semibold text-rose-600">{stats.rejected}</span>
                </p>
              )}
            </div>
          </div>
          <Link
            to="/applications"
            className="text-xs md:text-sm font-medium text-blue-600 bg-white px-3 py-1.5 rounded-md border border-blue-100 hover:bg-blue-50 transition inline-flex items-center gap-1"
          >
            View all
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
        </Link>
        </div>
        {(!applications || applications.length === 0) ? (
          <div className="p-6 md:p-8 text-center text-slate-600 text-sm md:text-base">
            No applications yet. Browse internships above and start your journey!
          </div>
        ) : (
          <div className="p-0">
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
                        <span className="text-sm md:text-base font-semibold text-slate-900 truncate">
                          {r.internships?.title || 'N/A'}
                        </span>
                        <span className="text-xs md:text-sm text-slate-600 truncate">
                          {r.internships?.software_house?.organization_name ||
                            r.internships?.software_house?.full_name ||
                            r.internships?.software_house?.email ||
                            ''}
                        </span>
                      </div>
                    </div>
                  )
                },
                {
                  Header: 'Applied on',
                  accessor: (r) => (
                    <span className="text-xs md:text-sm text-slate-600">
                      {r.applied_at ? new Date(r.applied_at).toLocaleDateString() : '--'}
                    </span>
                  )
                },
                {
                  Header: 'Status',
                  accessor: (r) => {
                    const styles = {
                      pending: 'bg-amber-50 text-amber-700 border border-amber-200',
                      accepted: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
                      rejected: 'bg-rose-50 text-rose-700 border border-rose-200'
                    }
                    return (
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] md:text-xs font-semibold ${
                          styles[r.status] || 'bg-slate-50 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {r.status?.charAt(0).toUpperCase() + r.status?.slice(1)}
                      </span>
                    )
                  }
                }
              ]}
              data={applications || []}
            />
          </div>
        )}
      </div>
      {/* Profile Picture Modal */}
      <ProfilePictureModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        profilePicture={profile?.profile_picture}
        userName={profile?.full_name || 'Student'}
        userRole={profile?.role || ''}
      />
    </div>
  )
}