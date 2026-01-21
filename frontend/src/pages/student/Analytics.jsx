import React, { useMemo, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../context/AuthContext'
import Spinner from '../../components/Spinner'
import { Link } from 'react-router-dom'
import RechartsBarChart from '../../components/charts/BarChart'

async function fetchStudentAnalytics(userId) {
  const { data: applications, error } = await supabase
    .from('applications')
    .select(`
      id,
      status,
      applied_at,
      updated_at,
      internships:internship_id (
        title,
        skills,
        software_house:software_house_id (
          organization_name,
          full_name,
          email
        )
      )
    `)
    .eq('user_id', userId)
    .order('applied_at', { ascending: false })

  if (error) throw error
  return applications || []
}

function StatusPill({ status }) {
  const map = {
    pending: 'bg-amber-100 text-amber-800 border-amber-200',
    accepted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    rejected: 'bg-rose-100 text-rose-800 border-rose-200',
    applied: 'bg-blue-100 text-blue-800 border-blue-200',
    reviewing: 'bg-purple-100 text-purple-800 border-purple-200'
  }
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${map[status] || 'bg-gray-100 text-gray-800 border-gray-200'}`}>
      {status?.charAt(0).toUpperCase() + status?.slice(1) || 'Unknown'}
    </span>
  )
}

export default function StudentAnalytics() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['student-analytics', profile?.id],
    queryFn: () => fetchStudentAnalytics(profile.id),
    enabled: !!profile?.id
  })

  useEffect(() => {
    if (!profile?.id) return
    const channel = supabase
      .channel('student-analytics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications', filter: `user_id=eq.${profile.id}` }, () => {
        refetch()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [profile?.id, refetch])

  const apps = data || []

  const stats = useMemo(() => {
    const total = apps.length
    const byStatus = apps.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc }, {})
    const accepted = byStatus['accepted'] || 0
    const pending = byStatus['pending'] || 0
    const rejected = byStatus['rejected'] || 0
    const applied = byStatus['applied'] || 0
    const reviewing = byStatus['reviewing'] || 0
    const acceptanceRate = total ? Math.round((accepted / total) * 100) : 0

    // monthly trend (last 6 months)
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
    const trend = months.map(m => ({
      label: m.label,
      count: apps.filter(a => {
        const d = a.applied_at ? new Date(a.applied_at) : null
        if (!d) return false
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        return key === m.key
      }).length,
    }))

    // top companies
    const companyCounts = {}
    apps.forEach((a) => {
      const name =
        a.internships?.software_house?.organization_name ||
        a.internships?.software_house?.full_name ||
        a.internships?.software_house?.email ||
        'Unknown'
      companyCounts[name] = (companyCounts[name] || 0) + 1
    })
    const topCompanies = Object.entries(companyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }))

    // top skills
    const skillCounts = {}
    apps.forEach((a) => (a.internships?.skills || []).forEach((s) => { skillCounts[s] = (skillCounts[s] || 0) + 1 }))
    const topSkills = Object.entries(skillCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([skill, count]) => ({ skill, count }))

    return { total, accepted, pending, rejected, applied, reviewing, acceptanceRate, byStatus, trend, topCompanies, topSkills }
  }, [apps])

  if (isLoading) return <Spinner />

  const prefetchApplications = async () => {
    if (!profile?.id) return
    await queryClient.prefetchQuery({
      queryKey: ['applications', profile.id, { status: undefined, search: undefined }],
      queryFn: async () => {
        const { data: apps } = await supabase
          .from('applications')
          .select(`
            id, status, applied_at, updated_at, feedback, internship_id,
            internships:internship_id (
              id,
              title,
              skills,
              software_house:software_house_id (
                organization_name,
                full_name,
                email
              )
            )
          `)
          .eq('user_id', profile.id)
          .order('applied_at', { ascending: false })
        return apps || []
      },
      staleTime: 60000
    })
  }

  return (
    <div className="space-y-6">
      {/* Header aligned with Software House / Admin Dashboard (colored panel) */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </span>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-blue-600">Analytics</h1>
              <p className="text-xs md:text-sm text-gray-600 mt-1">
                Track your applications, trends, and outcomes at a glance
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/listings"
              className="px-4 py-2 rounded-lg border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 transition text-sm font-medium"
            >
              Find Internships
            </Link>
            <Link
              to="/applications"
              onMouseEnter={prefetchApplications}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition text-sm font-semibold shadow-sm"
            >
              My Applications
            </Link>
          </div>
        </div>
      </div>

      {/* Key Metrics - Same style as Admin Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {/* Total Applications (blue) */}
        <div className="rounded-xl shadow-lg p-6 text-white bg-gradient-to-br from-blue-600 to-blue-500">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <div className="text-sm font-medium opacity-90 mb-1">Total Applications</div>
          <div className="text-3xl font-bold">{stats.total}</div>
        </div>

        {/* Acceptance Rate (purple) */}
        <div className="rounded-xl shadow-lg p-6 text-white bg-gradient-to-br from-purple-600 to-purple-500">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
          <div className="text-sm font-medium opacity-90 mb-1">Acceptance Rate</div>
          <div className="text-3xl font-bold">{stats.acceptanceRate}%</div>
        </div>

        {/* Pending (amber) */}
        <div className="rounded-xl shadow-lg p-6 text-white bg-gradient-to-br from-amber-500 to-amber-400">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="text-sm font-medium opacity-90 mb-1">Pending</div>
          <div className="text-3xl font-bold">{stats.pending}</div>
        </div>

        {/* Accepted (green) */}
        <div className="rounded-xl shadow-lg p-6 text-white bg-gradient-to-br from-emerald-600 to-emerald-500">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <div className="text-sm font-medium opacity-90 mb-1">Accepted</div>
          <div className="text-3xl font-bold">{stats.accepted}</div>
        </div>

        {/* Rejected (red) */}
        <div className="rounded-xl shadow-lg p-6 text-white bg-gradient-to-br from-rose-600 to-rose-500">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
          <div className="text-sm font-medium opacity-90 mb-1">Rejected</div>
          <div className="text-3xl font-bold">{stats.rejected}</div>
        </div>
      </div>

      {/* Status Distribution and Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Distribution */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </span>
            <h2 className="text-lg font-semibold text-gray-900">Status Distribution</h2>
          </div>
          <div className="space-y-4">
            {['pending','accepted','rejected'].map((s) => {
              const count = stats.byStatus[s] || 0
              const percentage = stats.total ? Math.round((count / stats.total) * 100) : 0
              const colors = {
                pending: 'from-amber-500 to-amber-400',
                accepted: 'from-emerald-500 to-emerald-400',
                rejected: 'from-rose-500 to-rose-400'
              }
              return (
                <div key={s} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <StatusPill status={s} />
                    <div className="text-sm font-semibold text-gray-900">{count}</div>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full bg-gradient-to-r ${colors[s] || 'from-gray-500 to-gray-400'} transition-all`} style={{ width: `${percentage}%` }} />
                  </div>
                  <div className="text-xs text-gray-500">{percentage}% of total</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Applications Over Time */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </span>
              <h2 className="text-lg font-semibold text-gray-900">Applications Over Time</h2>
            </div>
            <span className="text-xs text-gray-500 bg-gray-50 px-3 py-1 rounded-full">Monthly Trend</span>
          </div>
          {stats.trend.every(t => t.count === 0) ? (
            <div className="text-center py-12 text-gray-600">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-sm font-medium">No recent applications</p>
              <p className="text-xs text-gray-500 mt-1">Applications will appear here once you start applying</p>
            </div>
          ) : (
            <div>
              <RechartsBarChart 
                data={stats.trend}
                dataKey="count"
                xKey="label"
                bars={[{ key: 'count', color: '#3b82f6', name: 'Applications' }]}
                height={300}
                noWrapper={true}
              />
              <div className="mt-4 grid grid-cols-3 md:grid-cols-6 gap-3">
                {stats.trend.map((month, idx) => (
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

      {/* Top Companies and Skills */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Companies */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </span>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900">Top Companies Applied</h2>
              <p className="text-xs text-gray-500">Most applications by organization</p>
            </div>
          </div>
          <div className="space-y-4">
            {stats.topCompanies.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <p className="text-sm text-gray-500">No data yet</p>
              </div>
            ) : stats.topCompanies.map((c, idx) => {
              const percentage = stats.total ? Math.round((c.count / stats.total) * 100) : 0
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
        </div>

        {/* Top Skills */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-teal-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </span>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900">Top Skills</h2>
              <p className="text-xs text-gray-500">Skills in applied listings</p>
            </div>
          </div>
          <div className="space-y-4">
            {stats.topSkills.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <p className="text-sm text-gray-500">No data yet</p>
              </div>
            ) : stats.topSkills.map((s, idx) => {
              const percentage = stats.total ? Math.round((s.count / stats.total) * 100) : 0
              return (
                <div key={s.skill} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 text-white text-xs font-bold flex-shrink-0">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-medium text-gray-900 truncate">{s.skill}</span>
                    </div>
                    <div className="text-sm font-semibold text-gray-900 ml-2">{s.count}</div>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all" style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-indigo-50 to-slate-50">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          </div>
          <Link
            to="/applications"
            onMouseEnter={prefetchApplications}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            View all
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
        <div className="divide-y divide-gray-200">
          {apps.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-600 mb-2">No applications yet</p>
              <p className="text-sm text-gray-500">Start exploring internships to see your activity here</p>
            </div>
          ) : apps.slice(0, 8).map((a) => (
            <div key={a.id} className="px-6 py-4 hover:bg-gray-50 transition">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{a.internships?.title || 'Unknown Role'}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span className="text-sm text-gray-600 truncate">
                        {a.internships?.software_house?.organization_name ||
                          a.internships?.software_house?.full_name ||
                          a.internships?.software_house?.email ||
                          'Unknown Company'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <StatusPill status={a.status} />
                  <div className="text-xs text-gray-500 whitespace-nowrap">
                    {new Date(a.applied_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}