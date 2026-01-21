import React, { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../utils/supabase'
import Spinner from '../../components/Spinner'
import MetricCard from '../../components/charts/MetricCard'
import LineChart from '../../components/charts/LineChart'
import BarChart from '../../components/charts/BarChart'
import PieChart from '../../components/charts/PieChart'
import AreaChart from '../../components/charts/AreaChart'
import {
  fetchUserAnalytics,
  fetchInternshipAnalytics,
  fetchApplicationAnalytics,
  fetchActivityAnalytics,
  fetchPerformanceMetrics,
  fetchRoleSpecificInsights
} from '../../utils/adminAnalytics'

export default function AdminAnalytics() {
  const queryClient = useQueryClient()
  const [dateFilter, setDateFilter] = useState('6months')

  // Fetch all analytics data
  const { data: userAnalytics, isLoading: userLoading } = useQuery({
    queryKey: ['admin-user-analytics', dateFilter],
    queryFn: () => fetchUserAnalytics(dateFilter),
    staleTime: 30000,
  })

  const { data: internshipAnalytics, isLoading: internshipLoading } = useQuery({
    queryKey: ['admin-internship-analytics', dateFilter],
    queryFn: () => fetchInternshipAnalytics(dateFilter),
    staleTime: 30000,
  })

  const { data: applicationAnalytics, isLoading: applicationLoading } = useQuery({
    queryKey: ['admin-application-analytics', dateFilter],
    queryFn: () => fetchApplicationAnalytics(dateFilter),
    staleTime: 30000,
  })

  const { data: activityAnalytics, isLoading: activityLoading } = useQuery({
    queryKey: ['admin-activity-analytics', dateFilter],
    queryFn: () => fetchActivityAnalytics(dateFilter),
    staleTime: 30000,
  })

  const { data: performanceMetrics, isLoading: performanceLoading } = useQuery({
    queryKey: ['admin-performance-metrics', dateFilter],
    queryFn: () => fetchPerformanceMetrics(dateFilter),
    staleTime: 30000,
  })

  const { data: roleInsights, isLoading: roleLoading } = useQuery({
    queryKey: ['admin-role-insights', dateFilter],
    queryFn: () => fetchRoleSpecificInsights(dateFilter),
    staleTime: 30000,
  })

  const isLoading = userLoading || internshipLoading || applicationLoading || activityLoading || performanceLoading || roleLoading

  // Real-time subscriptions
  useEffect(() => {
    const profilesChannel = supabase
      .channel('admin-analytics-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        queryClient.invalidateQueries(['admin-user-analytics'])
        queryClient.invalidateQueries(['admin-performance-metrics'])
        queryClient.invalidateQueries(['admin-role-insights'])
      })
      .subscribe()

    const internshipsChannel = supabase
      .channel('admin-analytics-internships')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internships' }, () => {
        queryClient.invalidateQueries(['admin-internship-analytics'])
        queryClient.invalidateQueries(['admin-performance-metrics'])
      })
      .subscribe()

    const applicationsChannel = supabase
      .channel('admin-analytics-applications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => {
        queryClient.invalidateQueries(['admin-application-analytics'])
        queryClient.invalidateQueries(['admin-role-insights'])
      })
      .subscribe()

    const activityChannel = supabase
      .channel('admin-analytics-activity')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, () => {
        queryClient.invalidateQueries(['admin-activity-analytics'])
      })
      .subscribe()

    const adminLogsChannel = supabase
      .channel('admin-analytics-admin-logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_logs' }, () => {
        queryClient.invalidateQueries(['admin-activity-analytics'])
      })
      .subscribe()

    return () => {
      supabase.removeChannel(profilesChannel)
      supabase.removeChannel(internshipsChannel)
      supabase.removeChannel(applicationsChannel)
      supabase.removeChannel(activityChannel)
      supabase.removeChannel(adminLogsChannel)
    }
  }, [queryClient])

  // Prepare chart data
  const roleDistributionData = useMemo(() => {
    if (!userAnalytics?.roleDistribution) return []
    return Object.entries(userAnalytics.roleDistribution).map(([role, count]) => ({
      label: role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' '),
      value: count
    }))
  }, [userAnalytics])

  const userStatusData = useMemo(() => {
    if (!userAnalytics?.statusDistribution) return []
    return [
      { label: 'Active', value: userAnalytics.statusDistribution.active, color: '#10b981' },
      { label: 'Inactive', value: userAnalytics.statusDistribution.inactive, color: '#6b7280' },
      { label: 'Approved', value: userAnalytics.statusDistribution.approved, color: '#10b981' },
      { label: 'Pending', value: userAnalytics.statusDistribution.pending, color: '#f59e0b' },
      { label: 'Rejected', value: userAnalytics.statusDistribution.rejected, color: '#ef4444' }
    ].filter(item => item.value > 0)
  }, [userAnalytics])

  const internshipStatusData = useMemo(() => {
    if (!internshipAnalytics?.statusCounts) return []
    return [
      { label: 'Approved', value: internshipAnalytics.statusCounts.approved, color: '#10b981' },
      { label: 'Pending', value: internshipAnalytics.statusCounts.pending, color: '#f59e0b' },
      { label: 'Rejected', value: internshipAnalytics.statusCounts.rejected, color: '#ef4444' }
    ].filter(item => item.value > 0)
  }, [internshipAnalytics])

  const applicationStatusData = useMemo(() => {
    if (!applicationAnalytics?.statusCounts) return []
    return [
      { label: 'Accepted', value: applicationAnalytics.statusCounts.accepted, color: '#10b981' },
      { label: 'Pending', value: applicationAnalytics.statusCounts.pending, color: '#f59e0b' },
      { label: 'Rejected', value: applicationAnalytics.statusCounts.rejected, color: '#ef4444' }
    ].filter(item => item.value > 0)
  }, [applicationAnalytics])

  const roleGrowthData = useMemo(() => {
    if (!userAnalytics?.roleGrowthData) return []
    const roles = Object.keys(userAnalytics.roleGrowthData)
    if (roles.length === 0) return []

    // Get all months
    const months = userAnalytics.growthTrend?.map(t => t.label) || []
    
    // Create data structure for stacked area chart
    return months.map(month => {
      const dataPoint = { label: month }
      roles.forEach(role => {
        const roleData = userAnalytics.roleGrowthData[role]
        const monthData = roleData.find(d => d.label === month)
        dataPoint[role] = monthData?.count || 0
      })
      return dataPoint
    })
  }, [userAnalytics])

  const roleGrowthAreas = useMemo(() => {
    if (!userAnalytics?.roleGrowthData) return []
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
    return Object.keys(userAnalytics.roleGrowthData).map((role, index) => ({
      key: role,
      name: role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' '),
      color: colors[index % colors.length]
    }))
  }, [userAnalytics])

  const actionDistributionData = useMemo(() => {
    if (!activityAnalytics?.actionCounts) return []
    return Object.entries(activityAnalytics.actionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([action, count]) => ({
        label: action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        count
      }))
  }, [activityAnalytics])

  const roleActivityData = useMemo(() => {
    if (!activityAnalytics?.roleCounts) return []
    return Object.entries(activityAnalytics.roleCounts).map(([role, count]) => ({
      label: role.charAt(0).toUpperCase() + role.slice(1),
      count
    }))
  }, [activityAnalytics])

  const roleActivityTrendData = useMemo(() => {
    if (!activityAnalytics?.roleActivityTrend) return []
    const roles = Object.keys(activityAnalytics.roleActivityTrend)
    if (roles.length === 0) return []

    // Get all months
    const months = activityAnalytics.activityTrend?.map(t => t.label) || []
    
    // Create data structure for stacked area chart
    return months.map(month => {
      const dataPoint = { label: month }
      roles.forEach(role => {
        const roleData = activityAnalytics.roleActivityTrend[role]
        const monthData = roleData.find(d => d.label === month)
        dataPoint[role] = monthData?.count || 0
      })
      return dataPoint
    })
  }, [activityAnalytics])

  const roleActivityAreas = useMemo(() => {
    if (!activityAnalytics?.roleActivityTrend) return []
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4']
    return Object.keys(activityAnalytics.roleActivityTrend).map((role, index) => ({
      key: role,
      name: role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' '),
      color: colors[index % colors.length]
    }))
  }, [activityAnalytics])

  const rolePerformanceData = useMemo(() => {
    if (!roleInsights) return []
    return [
      {
        label: 'Students',
        applications: roleInsights.student?.applicationsSubmitted || 0,
        acceptanceRate: roleInsights.student?.applicationsSubmitted > 0
          ? Math.round((roleInsights.student.applicationsAccepted / roleInsights.student.applicationsSubmitted) * 100)
          : 0
      },
      {
        label: 'Software Houses',
        internships: roleInsights.softwareHouse?.internshipsPosted || 0,
        approvalRate: roleInsights.softwareHouse?.internshipsPosted > 0
          ? Math.round((roleInsights.softwareHouse.internshipsApproved / roleInsights.softwareHouse.internshipsPosted) * 100)
          : 0
      },
      {
        label: 'Universities',
        students: roleInsights.university?.studentsRegistered || 0,
        applicationRate: roleInsights.university?.studentApplicationRate || 0
      },
      {
        label: 'Guests',
        applications: roleInsights.guest?.applicationsSubmitted || 0,
        conversion: roleInsights.guest?.conversionToStudent || 0
      }
    ]
  }, [roleInsights])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-blue-600">Analytics Dashboard</h1>
            <p className="text-sm text-gray-600 mt-1">
              Comprehensive insights into platform performance, user behavior, and key metrics.
            </p>
          </div>
          {/* Date Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Time Period:</label>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="6months">Last 6 Months</option>
              <option value="1year">Last Year</option>
              <option value="all">All Time</option>
            </select>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <MetricCard
          title="Total Users"
          value={userAnalytics?.totalUsers || 0}
          subtitle="Registered users"
          trend={userAnalytics?.growthPercentage}
          gradient="from-blue-600 to-blue-500"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
        />
        <MetricCard
          title="Total Internships"
          value={internshipAnalytics?.totalInternships || 0}
          subtitle={`${internshipAnalytics?.approvalRate || 0}% approval rate`}
          gradient="from-orange-500 to-orange-600"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
        />
        <MetricCard
          title="Total Applications"
          value={applicationAnalytics?.totalApplications || 0}
          subtitle={`${applicationAnalytics?.acceptanceRate || 0}% acceptance rate`}
          gradient="from-purple-500 to-purple-600"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
        <MetricCard
          title="Platform Activity"
          value={activityAnalytics?.totalActivities || 0}
          subtitle="Actions in selected period"
          gradient="from-gray-700 to-gray-800"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
        <MetricCard
          title="Pending Approvals"
          value={userAnalytics?.pendingApprovals || 0}
          subtitle="User + Internship approvals"
          gradient="from-green-600 to-green-500"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
            </svg>
          }
        />
      </div>

      {/* User Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LineChart
          title="User Growth Trend"
          data={userAnalytics?.growthTrend || []}
          dataKey="count"
          xKey="label"
          height={300}
        />
        <PieChart
          title="Role Distribution"
          data={roleDistributionData}
          dataKey="value"
          nameKey="label"
          height={300}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AreaChart
          title="User Growth by Role"
          data={roleGrowthData}
          xKey="label"
          areas={roleGrowthAreas}
          stacked={true}
          height={300}
        />
        <PieChart
          title="User Status Distribution"
          data={userStatusData}
          dataKey="value"
          nameKey="label"
          colors={userStatusData.map(d => d.color)}
          height={300}
        />
      </div>

      {/* Internship Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AreaChart
          title="Internship Trends"
          data={internshipAnalytics?.trends || []}
          dataKey="count"
          xKey="label"
          height={300}
        />
        <PieChart
          title="Internship Status Distribution"
          data={internshipStatusData}
          dataKey="value"
          nameKey="label"
          colors={internshipStatusData.map(d => d.color)}
          height={300}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BarChart
          title="Top Software Houses by Internships"
          data={internshipAnalytics?.topSoftwareHouses || []}
          dataKey="count"
          xKey="name"
          height={300}
          horizontal={true}
        />
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Internship Metrics</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Approval Rate</span>
              <span className="text-2xl font-bold text-blue-600">{internshipAnalytics?.approvalRate || 0}%</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Avg Approval Time</span>
              <span className="text-2xl font-bold text-green-600">{internshipAnalytics?.avgApprovalTime || 0}h</span>
            </div>
          </div>
        </div>
      </div>

      {/* Application Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LineChart
          title="Application Trends"
          data={applicationAnalytics?.trends || []}
          dataKey="count"
          xKey="label"
          height={300}
        />
        <PieChart
          title="Application Status Distribution"
          data={applicationStatusData}
          dataKey="value"
          nameKey="label"
          colors={applicationStatusData.map(d => d.color)}
          height={300}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BarChart
          title="Applications by Role"
          data={[
            { label: 'Students', count: applicationAnalytics?.roleCounts?.student || 0 },
            { label: 'Guests', count: applicationAnalytics?.roleCounts?.guest || 0 }
          ]}
          dataKey="count"
          xKey="label"
          bars={[
            { key: 'count', color: '#3b82f6', name: 'Applications' }
          ]}
          height={300}
        />
        <BarChart
          title="Top Internships by Applications"
          data={applicationAnalytics?.topInternships || []}
          dataKey="count"
          xKey="title"
          height={300}
          horizontal={true}
        />
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Application Metrics</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Acceptance Rate</span>
              <span className="text-2xl font-bold text-purple-600">{applicationAnalytics?.acceptanceRate || 0}%</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Avg Response Time</span>
              <span className="text-2xl font-bold text-blue-600">{applicationAnalytics?.avgResponseTime || 0}h</span>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <span className="text-xs text-gray-600">Student Apps</span>
                <p className="text-lg font-semibold text-gray-900">{applicationAnalytics?.roleCounts?.student || 0}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <span className="text-xs text-gray-600">Guest Apps</span>
                <p className="text-lg font-semibold text-gray-900">{applicationAnalytics?.roleCounts?.guest || 0}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AreaChart
          title="Platform Activity Timeline"
          data={activityAnalytics?.activityTrend || []}
          dataKey="count"
          xKey="label"
          height={300}
        />
        <BarChart
          title="Most Common Actions"
          data={actionDistributionData}
          dataKey="count"
          xKey="label"
          height={300}
          horizontal={true}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AreaChart
          title="Activity by Role"
          data={roleActivityTrendData}
          xKey="label"
          areas={roleActivityAreas}
          stacked={true}
          height={300}
        />
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Active Users</h3>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {activityAnalytics?.topActiveUsers && activityAnalytics.topActiveUsers.length > 0 ? (
              activityAnalytics.topActiveUsers.map((user, index) => (
                <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-semibold">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-900 truncate">{user.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-blue-600">{user.count} actions</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">No activity data available</p>
            )}
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BarChart
          title="Role Performance Comparison"
          data={rolePerformanceData}
          bars={[
            { key: 'applications', color: '#3b82f6', name: 'Applications' },
            { key: 'internships', color: '#10b981', name: 'Internships' },
            { key: 'students', color: '#f59e0b', name: 'Students' }
          ]}
          xKey="label"
          height={300}
        />
        <BarChart
          title="Approval Processing Times"
          data={[
            { label: 'User Approvals', time: performanceMetrics?.avgUserApprovalTime || 0 },
            { label: 'Internship Approvals', time: performanceMetrics?.avgInternshipApprovalTime || 0 }
          ]}
          dataKey="time"
          xKey="label"
          bars={[
            { key: 'time', color: '#3b82f6', name: 'Hours' }
          ]}
          height={300}
        />
      </div>

      {/* Additional Performance Metrics */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform Performance Metrics</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-lg">
            <span className="text-sm font-medium text-gray-700">Engagement Rate</span>
            <span className="text-2xl font-bold text-indigo-600">{performanceMetrics?.engagementRate || 0}%</span>
          </div>
          <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
            <span className="text-sm font-medium text-gray-700">Conversion Rate</span>
            <span className="text-2xl font-bold text-green-600">{performanceMetrics?.conversionRate || 0}%</span>
          </div>
          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
            <span className="text-sm font-medium text-gray-700">Health Score</span>
            <span className="text-2xl font-bold text-blue-600">{performanceMetrics?.healthScore || 0}</span>
          </div>
          <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg">
            <span className="text-sm font-medium text-gray-700">Avg User Approval</span>
            <span className="text-2xl font-bold text-purple-600">{performanceMetrics?.avgUserApprovalTime || 0}h</span>
          </div>
        </div>
      </div>

      {/* Top Universities */}
      {userAnalytics?.topUniversities && userAnalytics.topUniversities.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Universities by Student Count</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {userAnalytics.topUniversities.map((uni, index) => (
              <div key={uni.id} className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-semibold">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium text-gray-900 truncate">{uni.name}</span>
                </div>
                <p className="text-lg font-bold text-blue-600">{uni.count} students</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

