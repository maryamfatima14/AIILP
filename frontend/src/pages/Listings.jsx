import React, { useMemo, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../utils/supabase'
import Card from '../components/Card'
import Spinner from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'

async function fetchApprovedInternships() {
  console.log('[Listings] Starting to fetch internships...')
  
  // First, try without join to see if basic query works
  const { data: basicData, error: basicError } = await supabase
    .from('internships')
    .select('*')
    .eq('status', 'approved')
  
  console.log('[Listings] Basic query result:', {
    count: basicData?.length || 0,
    error: basicError,
    sample: basicData?.[0]
  })
  
  if (basicError) {
    console.error('[Listings] Basic query error:', basicError)
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
    console.error('[Listings] Error fetching internships with join:', error)
    // If join fails, return basic data without profiles
    if (basicData && basicData.length > 0) {
      console.warn('[Listings] Join failed, returning data without profiles')
      return basicData.map(item => ({ ...item, profiles: null }))
    }
    throw error
  }
  
  console.log('[Listings] Fetched internships:', {
    count: data?.length || 0,
    withProfiles: data?.filter(i => i.profiles).length || 0,
    sample: data?.[0]
  })
  
  return data || []
}

async function checkCVComplete(userId) {
  const { data, error } = await supabase
    .from('cv_forms')
    .select('is_complete')
    .eq('user_id', userId)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error
  return data?.is_complete || false
}

export default function Listings() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { data, isLoading, error: listingsError } = useQuery({
    queryKey: ['internships', 'approved'],
    queryFn: fetchApprovedInternships,
    retry: 2,
    staleTime: 30000 // Cache for 30 seconds
  })
  const [term, setTerm] = useState('')
  const [skillsFilter, setSkillsFilter] = useState('')
  const [durationFilter, setDurationFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [applyingId, setApplyingId] = useState(null)

  const { data: userApplications, refetch: refetchUserApplications } = useQuery({
    queryKey: ['applications', profile?.id, 'listings'],
    queryFn: async () => {
      if (!profile?.id) return []
      const { data: apps, error } = await supabase
        .from('applications')
        .select('id, internship_id')
        .eq('user_id', profile.id)
      if (error) throw error
      return apps || []
    },
    enabled: !!profile?.id,
    staleTime: 60000,
  })

  const apply = async (internshipId) => {
    if (!profile?.id) {
      toast.error('Please login to apply')
      navigate('/login')
      return
    }

    // Check if CV is complete
    const cvComplete = await checkCVComplete(profile.id)
    if (!cvComplete) {
      toast.error('Please complete your CV Form before applying')
      navigate('/cv')
      return
    }

    try {
      setApplyingId(internshipId)

      // Check duplicate
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
      refetchUserApplications()
    } finally {
      setApplyingId(null)
    }
  }

  const filtered = useMemo(() => {
    let result = data || []
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
      const filterValue = typeFilter.trim().toLowerCase()
      result = result.filter((i) => {
        if (!i.type) return false
        // Normalize both values: trim, lowercase, and normalize hyphens/spaces
        const internshipType = String(i.type).trim().toLowerCase().replace(/[\s_]+/g, '-')
        const normalizedFilter = filterValue.replace(/[\s_]+/g, '-')
        // Exact match after normalization
        return internshipType === normalizedFilter
      })
    }

    return result
  }, [data, term, skillsFilter, durationFilter, typeFilter])

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-6">
      {/* Header aligned with dashboard style (colored panel) */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7h.01M8 3h8a2 2 0 012 2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2zm0 4h8"
                />
              </svg>
            </span>
    <div>
              <h2 className="text-2xl md:text-3xl font-bold text-blue-600">Find Internships</h2>
              <p className="text-sm text-gray-600 mt-1">
                Browse and apply to curated internship opportunities from verified software houses.
              </p>
            </div>
          </div>
          {filtered && (
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-lg bg-white border border-indigo-100 text-sm font-medium text-slate-700 shadow-sm">
                Results: <span className="text-blue-600 font-bold">{filtered.length}</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b bg-gradient-to-r from-slate-50 to-indigo-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/5 text-slate-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707L15 12.414V17l-3 2-3-2v-4.586L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Search & Filters</h3>
              <p className="text-xs text-slate-500">Find internships by title, skills, or duration</p>
            </div>
          </div>
        </div>

        {listingsError && (
          <div className="px-4 md:px-6 pt-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start gap-3">
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12A9 9 0 113 12a9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-red-800">Error loading internships</h4>
                <p className="text-xs md:text-sm text-red-600 mt-1">
                  {listingsError.message || 'Failed to load internships. Please try again.'}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="px-4 md:px-6 pb-5 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <div className="relative">
                <input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Search by title or description..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                <svg
                  className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Skills */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Skills</label>
              <input
                value={skillsFilter}
                onChange={(e) => setSkillsFilter(e.target.value)}
                placeholder="e.g., React, Node.js"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue500 text-sm"
              />
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
              <select
                value={durationFilter}
                onChange={(e) => setDurationFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              >
                <option value="">All Durations</option>
                <option value="3 months">3 Months</option>
                <option value="6 months">6 Months</option>
                <option value="full-time">Full-Time</option>
              </select>
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              >
                <option value="">All Types</option>
                <option value="full-time">Full-Time</option>
                <option value="part-time">Part-Time</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="contract">Contract</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Internship Cards */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-10 text-center">
          <svg className="w-14 h-14 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">No internships found</h3>
          <p className="text-sm text-slate-600">
            {term || skillsFilter || durationFilter || typeFilter
              ? 'Try adjusting your filters to discover more opportunities.'
              : 'No internships are available at the moment. Please check back soon.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((i, index) => {
            const alreadyApplied = (userApplications || []).some(a => a.internship_id === i.id)
            const isProcessing = applyingId === i.id
            const disabled = alreadyApplied || isProcessing

            // Reuse gradient set similar to My Internships
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
                {/* Image / Banner */}
                <div className={`relative h-40 bg-gradient-to-br ${gradientClass} overflow-hidden`}>
                  <div className="absolute inset-0 bg-black/15" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-white">
                      <svg className="w-12 h-12 mx-auto mb-2 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 7H8m0 0V5a2 2 0 012-2h4a2 2 0 012 2v2m-8 0h8m-9 4h10M5 7h.01M5 11h.01M5 15h.01M5 19h.01M9 15h2"
                        />
                      </svg>
                      <p className="text-xs font-medium uppercase tracking-wide opacity-90">Internship Opportunity</p>
                    </div>
                  </div>
                  <div className="absolute top-4 right-4">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold shadow-lg bg-emerald-50 text-emerald-700">
                      Approved
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5">
                  {/* Title & company */}
                  <div className="mb-3">
                    <h3 className="text-lg font-bold text-slate-900 mb-1 line-clamp-2">{i.title}</h3>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5"
                        />
                      </svg>
                      <span>{i.profiles?.organization_name || i.profiles?.full_name || 'Software House'}</span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-slate-700 mb-3 line-clamp-3">
                    {i.description || 'No description provided for this internship.'}
                  </p>

                  {/* Meta info */}
                  <div className={`grid gap-3 mb-3 text-xs text-slate-600 ${
                    (i.location && i.duration && i.type) ? 'grid-cols-3' : 
                    ((i.location && i.duration) || (i.location && i.type) || (i.duration && i.type)) ? 'grid-cols-2' : 
                    'grid-cols-1'
                  }`}>
                    {i.location && (
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-slate-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0L6.343 16.657A8 8 0 1117.657 16.657z"
                          />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <div>
                          <div className="text-[11px] text-slate-500">Location</div>
                          <div className="text-sm font-medium text-slate-900">{i.location}</div>
                        </div>
                      </div>
                    )}
                    {i.duration && (
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-slate-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3A9 9 0 113 12a9 9 0 0118 0z"
                          />
                        </svg>
                        <div>
                          <div className="text-[11px] text-slate-500">Duration</div>
                          <div className="text-sm font-medium text-slate-900">{i.duration}</div>
                        </div>
                      </div>
                    )}
                    {i.type && (
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-slate-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                          />
                        </svg>
                        <div>
                          <div className="text-[11px] text-slate-500">Type</div>
                          <div className="text-sm font-medium text-slate-900 capitalize">{i.type}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Skills */}
                  {i.skills && i.skills.length > 0 && (
                    <div className="mb-4">
                      <div className="text-xs text-slate-500 mb-1">Required Skills</div>
                      <div className="flex flex-wrap gap-1.5">
                        {i.skills.slice(0, 5).map((skill, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-medium border border-blue-200"
                          >
                            {skill}
                          </span>
                        ))}
                        {i.skills.length > 5 && (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium">
                            +{i.skills.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Apply Button */}
                  {(profile?.role === 'student' || profile?.role === 'guest') && (
                    <div className="pt-3 border-t border-slate-200">
                      <button
                        onClick={() => !disabled && apply(i.id)}
                        disabled={disabled}
                        className={`w-full px-4 py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 ${
                          alreadyApplied
                            ? 'bg-slate-100 text-slate-500 cursor-not-allowed'
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
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}