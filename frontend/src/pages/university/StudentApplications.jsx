import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../context/AuthContext'
import Table from '../../components/Table'
import Spinner from '../../components/Spinner'
import toast from 'react-hot-toast'

async function fetchStudentApplications(universityId, filters = {}) {
  // Get all students for this university
  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('user_id')
    .eq('university_id', universityId)

  if (studentsError) throw studentsError

  const studentUserIds = students?.map(s => s.user_id) || []

  if (studentUserIds.length === 0) return []

  // Fetch profiles to get updated names
  let profilesMap = {}
  try {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', studentUserIds)
    
    if (profiles) {
      profilesMap = profiles.reduce((acc, p) => {
        if (p.full_name) {
          acc[p.id] = p.full_name
        }
        return acc
      }, {})
    }
  } catch (err) {
    console.warn('[StudentApplications] Error fetching profiles:', err)
  }

  // Fetch students separately to avoid profile join issues
  let studentsMap = {}
  try {
    const { data: studentsData, error: studentsErr } = await supabase
      .from('students')
      .select('user_id, name, email, student_id, batch')
      .in('user_id', studentUserIds)
    
    if (!studentsErr && studentsData) {
      studentsMap = studentsData.reduce((acc, s) => {
        acc[s.user_id] = {
          name: s.name,
          email: s.email,
          student_id: s.student_id,
          batch: s.batch
        }
        return acc
      }, {})
    }
  } catch (err) {
    console.warn('[StudentApplications] Error fetching students:', err)
  }

  // Try to fetch with nested join first (without students join to avoid profile issues)
  let query = supabase
    .from('applications')
    .select(`
      *,
      internships:internship_id (
        id,
        title,
        description,
        skills,
        duration,
        location,
        software_house_id,
        software_house:software_house_id (
          organization_name,
          full_name,
          email
        )
      )
    `)
    .in('user_id', studentUserIds)
    .order('applied_at', { ascending: false })

  if (filters.status) {
    query = query.eq('status', filters.status)
  }

  let { data, error } = await query

  // If nested join fails, fetch separately
  if (error || !data || data.some(app => !app.internships?.software_house)) {
    console.warn('[StudentApplications] Nested join may have failed, fetching separately')
    
    // Fetch applications without nested software_house join
    let fallbackQuery = supabase
      .from('applications')
      .select(`
        *,
        internships:internship_id (
          id,
          title,
          description,
          skills,
          duration,
          location,
          software_house_id
        )
      `)
      .in('user_id', studentUserIds)
      .order('applied_at', { ascending: false })

    if (filters.status) {
      fallbackQuery = fallbackQuery.eq('status', filters.status)
    }

    const { data: appsWithoutJoin, error: appsError } = await fallbackQuery

    if (appsError) {
      console.error('[StudentApplications] Error fetching applications:', appsError)
      throw appsError
    }

    // Get unique software_house_ids
    const softwareHouseIds = [...new Set(
      (appsWithoutJoin || [])
        .map(app => app.internships?.software_house_id)
        .filter(Boolean)
    )]

    // Fetch software houses separately
    let softwareHousesMap = {}
    if (softwareHouseIds.length > 0) {
      const { data: softwareHouses, error: shError } = await supabase
        .from('profiles')
        .select('id, organization_name, full_name, email')
        .in('id', softwareHouseIds)
        .eq('role', 'software_house')

      if (!shError && softwareHouses) {
        softwareHousesMap = softwareHouses.reduce((acc, sh) => {
          acc[sh.id] = {
            organization_name: sh.organization_name,
            full_name: sh.full_name,
            email: sh.email
          }
          return acc
        }, {})
      }
    }

    // Merge software house data into applications
    data = (appsWithoutJoin || []).map(app => ({
      ...app,
      internships: app.internships ? {
        ...app.internships,
        software_house: softwareHousesMap[app.internships.software_house_id] || null
      } : null
    }))
  } else if (error) {
    throw error
  }

  // Merge students data into applications
  data = (data || []).map(app => ({
    ...app,
    students: studentsMap[app.user_id] || null
  }))

  // Apply in-memory filtering for search (student name or internship title), and batch
  // (since we can't use ilike on nested relations)
  let filteredData = data || []
  
  if (filters.search && filters.search.trim()) {
    const searchTerm = filters.search.trim().toLowerCase()
    filteredData = filteredData.filter(app => {
      const studentName = app.profilesMap?.[app.user_id] || app.students?.name || ''
      const internshipTitle = app.internships?.title || ''
      // Search in both student name and internship title
      return studentName.toLowerCase().includes(searchTerm) || 
             internshipTitle.toLowerCase().includes(searchTerm)
    })
  }

  if (filters.batch) {
    filteredData = filteredData.filter(app => {
      const studentBatch = app.students?.batch
      return studentBatch && String(studentBatch) === String(filters.batch)
    })
  }
  
  // Add profilesMap to each application for name resolution
  return filteredData.map(app => ({
    ...app,
    profilesMap
  }))
}

export default function StudentApplications() {
  const { profile } = useAuth()
  const [statusFilter, setStatusFilter] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [batchFilter, setBatchFilter] = useState('')

  const filters = useMemo(() => ({
    status: statusFilter || undefined,
    search: searchFilter || undefined,
    batch: batchFilter || undefined
  }), [statusFilter, searchFilter, batchFilter])

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['university-applications', profile?.id, filters],
    queryFn: () => fetchStudentApplications(profile.id, filters),
    enabled: !!profile?.id,
    onError: (err) => {
      console.error('[StudentApplications] Query error:', err)
      toast.error('Failed to load applications. Please try again.')
    }
  })

  // Get unique batches from all students for filter dropdown
  const availableBatches = useMemo(() => {
    if (!data) return []
    const batches = new Set()
    data.forEach(app => {
      const batch = app.students?.batch
      if (batch) batches.add(String(batch))
    })
    return Array.from(batches).sort((a, b) => {
      // Sort numerically if possible, otherwise alphabetically
      const numA = parseInt(a)
      const numB = parseInt(b)
      if (!isNaN(numA) && !isNaN(numB)) return numB - numA // Descending order (newer batches first)
      return b.localeCompare(a)
    })
  }, [data])

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

  if (isLoading) return <Spinner />

  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-blue-600">Student Applications</h1>
              <p className="text-xs md:text-sm text-gray-600 mt-1">
                View and manage all student internship applications
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-lg border border-red-200 p-12 text-center">
          <svg className="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-red-900 mb-2">Error Loading Applications</h3>
          <p className="text-red-700 mb-6">{error.message || 'An error occurred while loading applications.'}</p>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition shadow-sm font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-blue-600">Student Applications</h1>
              <p className="text-xs md:text-sm text-gray-600 mt-1">
                View and manage all student internship applications
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-blue-200 rounded-lg">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm font-semibold text-gray-900">{data?.length || 0}</span>
            <span className="text-sm text-gray-600">{data?.length === 1 ? 'application' : 'applications'}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-gray-50 to-blue-50 px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </span>
            <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search (Student Name or Internship Title) */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
                </svg>
                Search
              </label>
              <div className="relative">
                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
                </svg>
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Search by student name or internship title..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Batch Filter */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Filter by Batch
              </label>
              <select
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">All Batches</option>
                {availableBatches.map(b => (
                  <option key={b} value={b}>Batch {b}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filter by Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Applications Table */}
      {!data || data.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-12 text-center">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Applications Found</h3>
          <p className="text-gray-600">
            {searchFilter || statusFilter || batchFilter
              ? 'Try adjusting your filters'
              : 'Your students haven\'t applied to any internships yet.'
            }
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-50 to-slate-50 px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </span>
              <h2 className="text-lg font-semibold text-gray-900">Applications</h2>
            </div>
          </div>
          <Table
            columns={[
              {
                Header: () => (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span>Student Name</span>
                  </div>
                ),
                accessor: (r) => {
                  // Use updated name from profiles if available, otherwise fall back to students.name
                  const displayName = r.profilesMap?.[r.user_id] || r.students?.name || 'N/A'
                  return (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-blue-600 flex-shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </span>
                      <div>
                        <p className="font-medium text-gray-900">{displayName}</p>
                        <p className="text-xs text-gray-600">{r.students?.student_id || ''}</p>
                      </div>
                    </div>
                  )
                }
              },
              {
                Header: () => (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>Student Email</span>
                  </div>
                ),
                accessor: (r) => (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm text-gray-700">{r.students?.email || 'N/A'}</span>
                  </div>
                )
              },
              {
                Header: () => (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>Batch</span>
                  </div>
                ),
                accessor: (r) => {
                  const batch = r.students?.batch
                  return batch ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 text-sm font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {batch}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">—</span>
                  )
                }
              },
              {
                Header: () => (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>Internship Title</span>
                  </div>
                ),
                accessor: (r) => {
                  const softwareHouse = r.internships?.software_house
                  const companyName = softwareHouse?.organization_name || 
                                     softwareHouse?.full_name || 
                                     softwareHouse?.email || 
                                     ''
                  return (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 flex-shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </span>
                      <div>
                        <p className="font-medium text-gray-900">{r.internships?.title || 'N/A'}</p>
                        {companyName && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            <p className="text-xs text-gray-600">{companyName}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }
              },
              {
                Header: () => (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Status</span>
                  </div>
                ),
                accessor: (r) => getStatusBadge(r.status)
              },
              {
                Header: () => (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>Applied Date</span>
                  </div>
                ),
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
                Header: () => (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Last Updated</span>
                  </div>
                ),
                accessor: (r) => (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span className="text-sm text-gray-700">{new Date(r.updated_at).toLocaleDateString()}</span>
                  </div>
                )
              }
            ]}
            data={data || []}
          />
        </div>
      )}
    </div>
  )
}

