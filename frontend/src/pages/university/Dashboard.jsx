import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../context/AuthContext'
import Spinner from '../../components/Spinner'
 
async function fetchDashboard(universityId) {
  // Fetch students
  const { data: students } = await supabase
    .from('students')
    .select('user_id, name, student_id, batch')
    .eq('university_id', universityId)

  const userIds = (students || []).map((s) => s.user_id)

  // Fetch profiles to get updated names
  let profilesMap = {}
  if (userIds.length > 0) {
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds)
      
      if (profiles) {
        profilesMap = profiles.reduce((acc, p) => {
          if (p.full_name) {
            acc[p.id] = p.full_name
          }
          return acc
        }, {})
      }
    } catch (err) {
      console.warn('[Dashboard] Error fetching profiles:', err)
      // Continue without profiles if fetch fails
    }
  }

  let applications = []
  if (userIds.length) {
    const { data: apps } = await supabase
      .from('applications')
      .select('id, user_id, status, applied_at, updated_at, internship_id, internships!inner(title)')
      .in('user_id', userIds)
      .order('applied_at', { ascending: false })
    applications = apps || []
  }

  const placedStudents = new Set(applications.filter((a) => a.status === 'accepted').map((a) => a.user_id)).size
  const pendingApps = applications.filter((a) => a.status === 'applied' || a.status === 'reviewing').length

  return {
    students: students || [],
    applications,
    profilesMap, // Include profiles map for name resolution
    stats: {
      totalStudents: students?.length || 0,
      placed: placedStudents,
      pending: pendingApps,
    },
  }
}

const COPY = {
  bulkUploadTitle: 'Bulk Upload Student Data',
  bulkUploadHelp: 'Upload a CSV file with student information to get started. Download a template to see the required format.',
  uploadCta: 'Upload CSV',
  batchPerformanceTitle: 'Batch Performance (2024)',
  totalStudentsLabel: 'Total Students',
  placedLabel: 'Placed',
  pendingLabel: 'Pending',
  appTrackingTitle: 'Internship Application Tracking',
  recentUpdatesTitle: 'Recent Updates',
}

function Donut({ percentage }) {
  const radius = 70
  const stroke = 14
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percentage / 100) * circumference
  const color = percentage >= 70 ? '#10b981' : percentage >= 40 ? '#3b82f6' : '#f59e0b'
  return (
    <svg width="180" height="180" className="mx-auto">
      <defs>
        <linearGradient id="donutGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={percentage >= 70 ? '#10b981' : percentage >= 40 ? '#3b82f6' : '#f59e0b'} stopOpacity="1" />
          <stop offset="100%" stopColor={percentage >= 70 ? '#059669' : percentage >= 40 ? '#2563eb' : '#d97706'} stopOpacity="1" />
        </linearGradient>
      </defs>
      <circle cx="90" cy="90" r={radius} stroke="#e5e7eb" strokeWidth={stroke} fill="none" />
      <circle
        cx="90"
        cy="90"
        r={radius}
        stroke="url(#donutGradient)"
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 90 90)"
        className="transition-all duration-500"
      />
      <text x="90" y="90" textAnchor="middle" className="text-3xl font-bold fill-gray-900">
        {Math.round(percentage)}%
      </text>
      <text x="90" y="110" textAnchor="middle" className="text-xs fill-gray-500">
        Placement Rate
      </text>
    </svg>
  )
}

export default function UniversityDashboard() {
  const { profile } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ['university-dashboard', profile?.id],
    queryFn: () => fetchDashboard(profile.id),
    enabled: !!profile?.id,
  })

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [batch, setBatch] = useState('')
  const pageSize = 4

  // Get unique batches from students for filter dropdown (must be before early return)
  const availableBatches = useMemo(() => {
    const batches = new Set()
    ;(data?.students || []).forEach(s => {
      if (s.batch) batches.add(String(s.batch))
    })
    return Array.from(batches).sort((a, b) => {
      // Sort numerically if possible, otherwise alphabetically
      const numA = parseInt(a)
      const numB = parseInt(b)
      if (!isNaN(numA) && !isNaN(numB)) return numB - numA // Descending order (newer batches first)
      return b.localeCompare(a)
    })
  }, [data?.students])

  if (isLoading) return <Spinner />

  const totalStudents = data?.stats.totalStudents || 0
  const placed = data?.stats.placed || 0
  const pending = data?.stats.pending || 0
  const percentPlaced = totalStudents ? (placed / totalStudents) * 100 : 0

  const rows = (data?.applications || []).map((a) => {
    const student = (data?.students || []).find((s) => s.user_id === a.user_id)
    // Use updated name from profiles if available, otherwise fall back to students.name
    const displayName = data?.profilesMap?.[a.user_id] || student?.name || 'Unknown'
    return {
      id: a.id,
      user_id: a.user_id,
      name: displayName,
      student_id: student?.student_id || a.user_id?.slice(0, 8),
      batch: student?.batch || null,
      company: a.internships?.title || 'N/A',
      status: a.status,
      applied_at: a.applied_at,
    }
  })

  const filtered = rows.filter((r) => {
    const matchesName = r.name.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = status ? r.status === status : true
    const matchesBatch = batch ? String(r.batch) === String(batch) : true
    return matchesName && matchesStatus && matchesBatch
  })
  const totalRows = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const startIdx = (currentPage - 1) * pageSize
  const pageRows = filtered.slice(startIdx, startIdx + pageSize)

  const recentUpdates = (data?.applications || []).slice(0, 3)

  const badgeColor = (s) => ({
    accepted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    rejected: 'bg-rose-100 text-rose-800 border-rose-200',
    pending: 'bg-amber-100 text-amber-800 border-amber-200',
    applied: 'bg-blue-100 text-blue-800 border-blue-200',
    reviewing: 'bg-purple-100 text-purple-800 border-purple-200',
  }[s] || 'bg-gray-100 text-gray-800 border-gray-200')

  const downloadTemplate = () => {
    const headers = ['name', 'email', 'student_id', 'batch', 'degree_program', 'semester']
    const exampleRow = ['John Doe', 'john.doe@example.com', 'STU001', '2024', 'BSE', '6']
    const csvContent = [headers, exampleRow].map((row) => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'student_upload_template.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Students */}
        <div className="rounded-xl shadow-lg p-6 text-white bg-gradient-to-br from-blue-600 to-blue-500">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
          </div>
          <div className="text-sm font-medium opacity-90 mb-1">Total Students</div>
          <div className="text-3xl font-bold">{totalStudents}</div>
        </div>

        {/* Placed Students */}
        <div className="rounded-xl shadow-lg p-6 text-white bg-gradient-to-br from-emerald-600 to-emerald-500">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <div className="text-sm font-medium opacity-90 mb-1">Placed Students</div>
          <div className="text-3xl font-bold">{placed}</div>
          <div className="text-xs opacity-80 mt-1">{Math.round(percentPlaced)}% placement rate</div>
        </div>

        {/* Pending Applications */}
        <div className="rounded-xl shadow-lg p-6 text-white bg-gradient-to-br from-amber-500 to-amber-400">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="text-sm font-medium opacity-90 mb-1">Pending Applications</div>
          <div className="text-3xl font-bold">{pending}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bulk Upload Tile */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11V3m0 8l-3-3m3 3l3-3M6 13a4 4 0 01-.88-7.903A5 5 0 1114.9 6H15a5 5 0 011 9.9" />
                  </svg>
                </span>
                <h3 className="text-lg font-semibold text-gray-900">{COPY.bulkUploadTitle}</h3>
              </div>
            </div>
            <div className="p-6">
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">{COPY.bulkUploadTitle}</h4>
                  <p className="text-sm text-gray-600 mb-4 max-w-md">
                    {COPY.bulkUploadHelp.split('template')[0]}
                    <button onClick={downloadTemplate} className="text-blue-600 hover:text-blue-700 underline font-medium">
                      template
                    </button>
                    {COPY.bulkUploadHelp.split('template')[1] || ''}
                  </p>
                  <Link
                    to="/bulk-upload"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition shadow-sm font-medium"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11V3m0 8l-3-3m3 3l3-3M6 13a4 4 0 01-.88-7.903A5 5 0 1114.9 6H15a5 5 0 011 9.9" />
                    </svg>
                    {COPY.uploadCta}
        </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Placement Performance */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </span>
            <h3 className="text-lg font-semibold text-gray-900">{COPY.batchPerformanceTitle}</h3>
          </div>
          <div className="flex justify-center mb-6">
            <Donut percentage={percentPlaced} />
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="text-xs text-gray-600 mb-1">{COPY.totalStudentsLabel}</div>
              <div className="text-xl font-bold text-blue-600">{totalStudents}</div>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg">
              <div className="text-xs text-gray-600 mb-1">{COPY.placedLabel}</div>
              <div className="text-xl font-bold text-emerald-600">{placed}</div>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg">
              <div className="text-xs text-gray-600 mb-1">{COPY.pendingLabel}</div>
              <div className="text-xl font-bold text-amber-600">{pending}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Internship Application Tracking and Recent Updates */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Application Tracking */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-50 to-slate-50 px-6 py-4 border-b border-gray-200">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </span>
                <h3 className="text-lg font-semibold text-gray-900">{COPY.appTrackingTitle}</h3>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative">
                  <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
                  </svg>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search students..."
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-48"
                  />
                </div>
                <select
                  value={batch}
                  onChange={(e) => {
                    setBatch(e.target.value)
                    setPage(1) // Reset to first page when filter changes
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="">All Batches</option>
                  {availableBatches.map(b => (
                    <option key={b} value={b}>Batch {b}</option>
                  ))}
                </select>
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value)
                    setPage(1) // Reset to first page when filter changes
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="">All Statuses</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                  <option value="pending">Pending</option>
                  <option value="applied">Applied</option>
                  <option value="reviewing">Reviewing</option>
                </select>
              </div>
            </div>
          </div>
          <div className="p-6">
            {pageRows.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-600">No applications found.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50">
                        <th className="px-4 py-3">Student Name</th>
                        <th className="px-4 py-3">Student ID</th>
                        <th className="px-4 py-3">Batch</th>
                        <th className="px-4 py-3">Company Applied</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pageRows.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-blue-600 flex-shrink-0">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                              </span>
                              <span className="font-medium text-gray-900">{r.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-600 font-mono">{r.student_id}</span>
                          </td>
                          <td className="px-4 py-3">
                            {r.batch ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 text-sm font-medium">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                {r.batch}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-900">{r.company}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${badgeColor(r.status)}`}>
                              {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Link 
                              to={`/university/students/${r.user_id}`} 
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium text-sm"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              View
        </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-6 flex items-center justify-between text-sm">
                  <div className="text-gray-600">
                    Showing <span className="font-semibold text-gray-900">{startIdx + 1}</span> to{' '}
                    <span className="font-semibold text-gray-900">{Math.min(startIdx + pageSize, totalRows)}</span> of{' '}
                    <span className="font-semibold text-gray-900">{totalRows}</span> applications
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setPage((p) => Math.max(1, p - 1))} 
                      disabled={currentPage === 1}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      Previous
                    </button>
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setPage(i + 1)}
                        className={`px-4 py-2 rounded-lg transition ${
                          currentPage === i + 1
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button 
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))} 
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Recent Updates */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-50 to-slate-50 px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              <h3 className="text-lg font-semibold text-gray-900">{COPY.recentUpdatesTitle}</h3>
            </div>
          </div>
          <div className="p-6">
            {recentUpdates.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-gray-500">No recent activity.</p>
              </div>
            ) : (
              <ul className="space-y-4">
                {recentUpdates.map((u) => {
                  const student = (data?.students || []).find((s) => s.user_id === u.user_id)
                  const name = data?.profilesMap?.[u.user_id] || student?.name || 'Student'
                  const statusConfig = {
                    accepted: {
                      color: 'text-emerald-600',
                      bg: 'bg-emerald-50',
                      icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
                      text: `${name}'s application was accepted.`
                    },
                    rejected: {
                      color: 'text-red-600',
                      bg: 'bg-red-50',
                      icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
                      text: `${name}'s application was rejected.`
                    },
                    default: {
                      color: 'text-blue-600',
                      bg: 'bg-blue-50',
                      icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
                      text: `${name} applied to ${u.internships?.title || 'an internship'}.`
                    }
                  }
                  const config = statusConfig[u.status] || statusConfig.default
                  return (
                    <li key={u.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full ${config.bg} flex items-center justify-center`}>
                        <svg className={`w-4 h-4 ${config.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={config.icon} />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900">{config.text}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(u.updated_at || u.applied_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}