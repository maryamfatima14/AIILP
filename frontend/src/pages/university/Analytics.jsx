import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../context/AuthContext'
import Spinner from '../../components/Spinner'
import RechartsBarChart from '../../components/charts/BarChart'

async function fetchAnalytics(universityId) {
  const { data: students } = await supabase
    .from('students')
    .select('user_id, name, batch, degree_program, semester')
    .eq('university_id', universityId)

  const userIds = (students || []).map(s => s.user_id)
  let applications = []
  if (userIds.length) {
    // Try to fetch with nested join first
    let { data: apps, error } = await supabase
      .from('applications')
      .select(`
        id,
        user_id,
        status,
        applied_at,
        updated_at,
        internship_id,
        internships:internship_id (
          title,
          software_house_id,
          software_house:software_house_id (
            organization_name,
            full_name,
            email
          )
        )
      `)
      .in('user_id', userIds)
      .order('applied_at', { ascending: false })

    // If nested join fails, fetch separately
    if (error || !apps || apps.some(app => !app.internships?.software_house)) {
      console.warn('[University Analytics] Nested join may have failed, fetching software houses separately')
      
      // Fetch applications without nested software_house join
      const { data: appsWithoutJoin, error: appsError } = await supabase
        .from('applications')
        .select(`
          id,
          user_id,
          status,
          applied_at,
          updated_at,
          internship_id,
          internships:internship_id (
            title,
            software_house_id
          )
        `)
        .in('user_id', userIds)
        .order('applied_at', { ascending: false })

      if (appsError) {
        console.error('[University Analytics] Error fetching applications:', appsError)
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
      apps = (appsWithoutJoin || []).map(app => ({
        ...app,
        internships: app.internships ? {
          ...app.internships,
          software_house: softwareHousesMap[app.internships.software_house_id] || null
        } : null
      }))
    }

    applications = apps || []
  }

  return {
    students: students || [],
    applications,
  }
}

function StatCard({ label, value, sub, gradient, icon }) {
  return (
    <div className={`rounded-xl shadow-lg p-6 text-white ${gradient}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div className="text-sm font-medium opacity-90 mb-1">{label}</div>
      <div className="text-3xl font-bold">{value}</div>
      {sub ? <div className="text-xs opacity-80 mt-1">{sub}</div> : null}
    </div>
  )
}

function BarChart({ data = [] }) {
  const max = Math.max(1, ...data.map(d => d.value))
  const getGradientClass = (color) => {
    const colorMap = {
      '#16a34a': 'from-emerald-500 to-emerald-400',
      '#dc2626': 'from-rose-500 to-rose-400',
      '#0284c7': 'from-blue-500 to-blue-400',
      '#2563eb': 'from-blue-600 to-indigo-600',
      '#6b7280': 'from-gray-500 to-gray-400',
      '#10b981': 'from-emerald-500 to-teal-500'
    }
    return colorMap[color] || 'from-blue-500 to-indigo-500'
  }
  return (
    <div className="space-y-4">
      {data.map((d) => {
        const percentage = max > 0 ? Math.round((d.value / max) * 100) : 0
        const gradientClass = getGradientClass(d.color)
        return (
          <div key={d.label} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900">{d.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">{d.value}</span>
                <span className="text-xs text-gray-500">({percentage}%)</span>
              </div>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
                className={`h-full rounded-full bg-gradient-to-r ${gradientClass} transition-all`}
                style={{ width: `${(d.value / max) * 100}%` }}
            />
            </div>
          </div>
        )
      })}
    </div>
  )
}


export default function UniversityAnalytics() {
  const { profile } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ['university-analytics', profile?.id],
    queryFn: () => fetchAnalytics(profile.id),
    enabled: !!profile?.id,
  })

  const analytics = useMemo(() => {
    const students = data?.students || []
    const apps = data?.applications || []

    const totalStudents = students.length
    const totalApplications = apps.length
    const accepted = apps.filter(a => a.status === 'accepted').length
    const rejected = apps.filter(a => a.status === 'rejected').length
    const reviewing = apps.filter(a => a.status === 'reviewing').length
    const applied = apps.filter(a => a.status === 'applied').length
    const pending = apps.filter(a => a.status === 'pending').length
    const acceptanceRate = totalApplications ? Math.round((accepted / totalApplications) * 100) : 0

    // Status breakdown for bar chart
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

    // Placements by batch (students with accepted apps)
    const placedIds = new Set(apps.filter(a => a.status === 'accepted').map(a => a.user_id))
    const batchCounts = {}
    students.forEach(s => {
      if (placedIds.has(s.user_id)) {
        const b = s.batch || 'Unknown'
        batchCounts[b] = (batchCounts[b] || 0) + 1
      }
    })
    const batchData = Object.entries(batchCounts).map(([label, value]) => ({ label, value }))

    // Top companies and internships
    const companyCounts = {}
    const internshipCounts = {}
    apps.forEach(a => {
      const company = 
        a.internships?.software_house?.organization_name ||
        a.internships?.software_house?.full_name ||
        a.internships?.software_house?.email ||
        'Unknown'
      const title = a.internships?.title || 'Unknown'
      companyCounts[company] = (companyCounts[company] || 0) + 1
      internshipCounts[title] = (internshipCounts[title] || 0) + 1
    })
    const topCompanies = Object.entries(companyCounts)
      .sort((a,b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }))
    const topInternships = Object.entries(internshipCounts)
      .sort((a,b) => b[1] - a[1])
      .slice(0, 5)
      .map(([title, count]) => ({ title, count }))

    // Recent activity
    const recent = apps.slice(0, 6).map(a => ({
      id: a.id,
      user_id: a.user_id,
      status: a.status,
      title: a.internships?.title || 'Internship',
      company: 
        a.internships?.software_house?.organization_name ||
        a.internships?.software_house?.full_name ||
        a.internships?.software_house?.email ||
        'Company',
      when: a.updated_at || a.applied_at,
    }))

    return {
      totals: { totalStudents, totalApplications, accepted, rejected, reviewing, applied, pending, acceptanceRate },
      statusData,
      appsByMonth,
      batchData,
      topCompanies,
      topInternships,
      recent,
    }
  }, [data])

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </span>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-blue-600">Analytics</h1>
            <p className="text-xs md:text-sm text-gray-600 mt-1">
              Comprehensive insights into student applications and placements
            </p>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label="Total Students" 
          value={analytics.totals.totalStudents}
          gradient="bg-gradient-to-br from-blue-600 to-blue-500"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
        />
        <StatCard 
          label="Total Applications" 
          value={analytics.totals.totalApplications}
          gradient="bg-gradient-to-br from-purple-600 to-purple-500"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
        <StatCard 
          label="Accepted" 
          value={analytics.totals.accepted} 
          sub={`${analytics.totals.acceptanceRate}% acceptance rate`}
          gradient="bg-gradient-to-br from-emerald-600 to-emerald-500"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          }
        />
        <StatCard 
          label="Pending / Reviewing" 
          value={analytics.totals.pending + analytics.totals.reviewing}
          gradient="bg-gradient-to-br from-amber-500 to-amber-400"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Status breakdown and Applications over time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Status breakdown */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </span>
            <h3 className="text-lg font-semibold text-gray-900">Application Status Breakdown</h3>
          </div>
        {analytics.statusData.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-sm text-gray-500">No application data yet.</p>
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
              <h3 className="text-lg font-semibold text-gray-900">Applications Over Time</h3>
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
      </div>

      {/* Placements by batch */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <h3 className="text-lg font-semibold text-gray-900">Placements by Batch</h3>
        </div>
        {analytics.batchData.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm text-gray-500">No placements yet.</p>
          </div>
        ) : (
          <BarChart data={analytics.batchData.map(d => ({ ...d, color: '#10b981' }))} />
        )}
      </div>

      {/* Top companies & internships */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </span>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">Top Companies</h3>
              <p className="text-xs text-gray-500">Most applications by organization</p>
            </div>
          </div>
          {analytics.topCompanies.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <p className="text-sm text-gray-500">No data yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {analytics.topCompanies.map((c, idx) => {
                const percentage = analytics.totals.totalApplications ? Math.round((c.count / analytics.totals.totalApplications) * 100) : 0
                return (
                  <div key={c.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-xs font-bold flex-shrink-0">
                          {idx + 1}
                        </span>
                        <span className="text-sm font-medium text-gray-900 truncate">{c.name}</span>
                      </div>
                      <div className="text-sm font-semibold text-gray-900 ml-2">{c.count}</div>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-teal-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </span>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">Top Internships</h3>
              <p className="text-xs text-gray-500">Most popular internship positions</p>
            </div>
          </div>
          {analytics.topInternships.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="text-sm text-gray-500">No data yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {analytics.topInternships.map((i, idx) => {
                const percentage = analytics.totals.totalApplications ? Math.round((i.count / analytics.totals.totalApplications) * 100) : 0
                return (
                  <div key={i.title} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 text-white text-xs font-bold flex-shrink-0">
                          {idx + 1}
                        </span>
                        <span className="text-sm font-medium text-gray-900 truncate">{i.title}</span>
                      </div>
                      <div className="text-sm font-semibold text-gray-900 ml-2">{i.count}</div>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-50 to-slate-50 px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
          </div>
        </div>
        <div className="p-6">
        {analytics.recent.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-600 mb-2">No recent activity</p>
              <p className="text-sm text-gray-500">Activity will appear here as students apply to internships</p>
            </div>
        ) : (
            <div className="divide-y divide-gray-200">
              {analytics.recent.map((r) => {
                const statusConfig = {
                  accepted: {
                    color: 'text-emerald-600',
                    bg: 'bg-emerald-50',
                    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
                    text: 'Application accepted'
                  },
                  rejected: {
                    color: 'text-red-600',
                    bg: 'bg-red-50',
                    icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
                    text: 'Application rejected'
                  },
                  default: {
                    color: 'text-blue-600',
                    bg: 'bg-blue-50',
                    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
                    text: 'Application submitted'
                  }
                }
                const config = statusConfig[r.status] || statusConfig.default
                return (
                  <div key={r.id} className="px-6 py-4 hover:bg-gray-50 transition">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="flex-shrink-0">
                          <div className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center`}>
                            <svg className={`w-5 h-5 ${config.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={config.icon} />
                            </svg>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-900 truncate">{r.title}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            <span className="text-sm text-gray-600 truncate">{r.company}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${
                          r.status === 'accepted' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                          r.status === 'rejected' ? 'bg-rose-100 text-rose-800 border-rose-200' :
                          'bg-blue-100 text-blue-800 border-blue-200'
                        }`}>
                          {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                        </span>
                        <div className="text-xs text-gray-500 whitespace-nowrap">
                          {r.when ? new Date(r.when).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
                </div>
        )}
        </div>
      </div>
    </div>
  )
}