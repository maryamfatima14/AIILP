import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../context/AuthContext'
import RechartsBarChart from '../../components/charts/BarChart'

async function fetchAnalytics(ownerId) {
  // Internships owned by this software house
  const { data: internships } = await supabase
    .from('internships')
    .select('id, title, status, created_at')
    .eq('software_house_id', ownerId)
    .order('created_at', { ascending: false })

  const internshipIds = (internships || []).map(i => i.id)

  // Applications to these internships
  let applications = []
  if (internshipIds.length) {
    const { data: apps } = await supabase
      .from('applications')
      .select(`
        id,
        user_id,
        status,
        applied_at,
        updated_at,
        internship_id,
        profiles:user_id (
          full_name,
          organization_name,
          university_id
        ),
        internships:internship_id (title)
      `)
      .in('internship_id', internshipIds)
      .order('applied_at', { ascending: false })
    applications = apps || []
  }

  // Fetch all universities to map id -> name
  const { data: universities } = await supabase
    .from('profiles')
    .select('id, organization_name, full_name, email')
    .eq('role', 'university')

  return { internships: internships || [], applications, universities: universities || [] }
}

function StatCard({ label, value, sub, gradient, icon }) {
  return (
    <div className={`relative overflow-hidden rounded-xl shadow-lg p-6 text-white ${gradient}`}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-12 -mb-12"></div>
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-white/90 uppercase tracking-wider">{label}</h3>
          {icon && (
            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
              {icon}
            </div>
          )}
        </div>
        <div className="text-3xl font-bold mb-1">{value}</div>
        {sub ? <div className="text-sm text-white/80">{sub}</div> : null}
      </div>
    </div>
  )
}

function BarChart({ data = [] }) {
  const max = Math.max(1, ...data.map(d => d.value))
  return (
    <div className="space-y-4">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-4">
          <div className="w-28 text-sm font-medium text-gray-700">{d.label}</div>
          <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-4 rounded-full transition-all duration-500 shadow-sm"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color || '#2563eb' }}
            />
          </div>
          <div className="w-16 text-sm font-semibold text-gray-900 text-right">{d.value}</div>
        </div>
      ))}
    </div>
  )
}


export default function SoftwareHouseAnalytics() {
  const { profile } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ['software-house-analytics', profile?.id],
    queryFn: () => fetchAnalytics(profile.id),
    enabled: !!profile?.id,
  })

  const analytics = useMemo(() => {
    const internships = data?.internships || []
    const apps = data?.applications || []
    const universities = data?.universities || []

    const universityNameMap = {}
    universities.forEach(u => {
      universityNameMap[u.id] = u.organization_name || u.full_name || u.email || u.id
    })

    const totalPostings = internships.length
    const totalApplicants = apps.length
    const accepted = apps.filter(a => a.status === 'accepted').length
    const rejected = apps.filter(a => a.status === 'rejected').length
    const reviewing = apps.filter(a => a.status === 'reviewing').length
    const applied = apps.filter(a => a.status === 'applied').length
    const pending = apps.filter(a => a.status === 'pending').length
    const pendingReviews = reviewing + pending
    const acceptanceRate = totalApplicants ? Math.round((accepted / totalApplicants) * 100) : 0

    const statusData = [
      { label: 'Accepted', value: accepted, color: '#16a34a' },
      { label: 'Rejected', value: rejected, color: '#dc2626' },
      { label: 'Reviewing', value: reviewing, color: '#0284c7' },
      { label: 'Applied', value: applied, color: '#2563eb' },
      { label: 'Pending', value: pending, color: '#6b7280' },
    ].filter(d => d.value > 0)

    // Applications per month (last 6 months)
    const now = new Date()
    const months = Array.from({ length: 6 }).map((_, i) => {
      const dt = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      // Include year if it's different from current year or if it's the first month
      const monthLabel = dt.toLocaleString(undefined, { month: 'short' })
      const yearLabel = dt.getFullYear() !== now.getFullYear() || i === 0 
        ? ` ${dt.getFullYear()}` 
        : ''
      return { key, label: `${monthLabel}${yearLabel}` }
    })
    const appsByMonth = months.map(m => ({
      label: m.label,
      count: apps.filter(a => {
        const d = a.applied_at ? new Date(a.applied_at) : null
        if (!d) return false
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        return key === m.key
      }).length,
    }))

    // Top universities by applicants
    const uniCounts = {}
    apps.forEach(a => {
      const uniId = a.profiles?.university_id
      const uni =
        (uniId && universityNameMap[uniId]) ||
        a.profiles?.organization_name ||
        'Unknown'
      uniCounts[uni] = (uniCounts[uni] || 0) + 1
    })
    const topUniversities = Object.entries(uniCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Top internships by applicants
    const internshipCounts = {}
    apps.forEach(a => {
      const title = a.internships?.title || 'Unknown'
      internshipCounts[title] = (internshipCounts[title] || 0) + 1
    })
    const topInternships = Object.entries(internshipCounts)
      .map(([title, count]) => ({ title, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      totalPostings: totalPostings,
      totalApplicants,
      pendingReviews,
      acceptanceRate,
      statusData,
      appsByMonth,
      topUniversities,
      topInternships,
    }
  }, [data])

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse h-6 w-32 bg-gray-200 rounded mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6 h-24" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header aligned with Admin Dashboard (colored panel) */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-blue-600">Analytics</h1>
            <p className="text-sm text-gray-600 mt-1">
              Track your internship performance, application trends, and key metrics.
            </p>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard 
          label="Total Postings" 
          value={analytics.totalPostings}
          gradient="bg-gradient-to-br from-blue-600 to-blue-500"
          icon={
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
        <StatCard 
          label="Total Applicants" 
          value={analytics.totalApplicants}
          gradient="bg-gradient-to-br from-purple-500 to-purple-600"
          icon={
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
        />
        <StatCard 
          label="Pending Reviews" 
          value={analytics.pendingReviews}
          gradient="bg-gradient-to-br from-green-600 to-green-500"
          icon={
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard 
          label="Acceptance Rate" 
          value={`${analytics.acceptanceRate}%`}
          gradient="bg-gradient-to-br from-orange-500 to-orange-600"
          icon={
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
        />
      </div>

      {/* Status breakdown */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-6">
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900">Application Status Breakdown</h3>
        </div>
        {analytics.statusData.length === 0 ? (
          <div className="text-center py-8 text-gray-600">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p>No applications yet.</p>
          </div>
        ) : (
          <BarChart data={analytics.statusData} />
        )}
      </div>

      {/* Applications last months */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </span>
            <h3 className="text-lg font-semibold text-gray-900">Applications (Last 6 Months)</h3>
          </div>
          <span className="text-xs text-gray-500 bg-gray-50 px-3 py-1 rounded-full">Monthly Trend</span>
        </div>
        {analytics.appsByMonth.every(p => p.count === 0) ? (
          <div className="text-center py-12 text-gray-600">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-sm font-medium">No recent applications</p>
            <p className="text-xs text-gray-500 mt-1">Applications will appear here once students start applying</p>
          </div>
        ) : (
          <div>
            <RechartsBarChart 
              data={analytics.appsByMonth}
              dataKey="count"
              xKey="label"
              bars={[{ key: 'count', color: '#3b82f6', name: 'Applications' }]}
              height={300}
              noWrapper={true}
            />
            <div className="mt-4 grid grid-cols-3 md:grid-cols-6 gap-3">
              {analytics.appsByMonth.map((month, idx) => (
                <div 
                  key={month.label} 
                  className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-3 border border-blue-100 text-center hover:shadow-md transition-shadow"
                >
                  <div className="text-xs font-medium text-gray-600 mb-1">{month.label}</div>
                  <div className="text-2xl font-bold text-blue-600">{month.count}</div>
                  <div className="text-xs text-gray-500 mt-1">applications</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Top universities & top internships */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900">Top Universities</h3>
          </div>
          {analytics.topUniversities.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <p>No applicants yet.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {analytics.topUniversities.map((u, idx) => (
                <li key={u.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                      {idx + 1}
                    </div>
                    <span className="font-medium text-gray-900">{u.name}</span>
                  </div>
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">{u.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900">Top Internships</h3>
          </div>
          {analytics.topInternships.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p>No applicants yet.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {analytics.topInternships.map((i, idx) => (
                <li key={i.title} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {idx + 1}
                    </div>
                    <span className="font-medium text-gray-900 truncate">{i.title}</span>
                  </div>
                  <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-semibold flex-shrink-0 ml-2">{i.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}