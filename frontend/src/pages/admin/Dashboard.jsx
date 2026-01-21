import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../utils/supabase'
import { logAdminAction } from '../../utils/logging'
import Spinner from '../../components/Spinner'
import Modal from '../../components/Modal'
import toast from 'react-hot-toast'

async function fetchStats() {
  const [
    activeUsersRes,
    inactiveUsersRes,
    internships,
    applications,
    pendingUserApprovals,
    pendingInternshipApprovals,
    students,
    universities,
    softwareHouses,
    guests,
    adminsRes,
  ] = await Promise.all([
    // Active users: anyone marked active
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true),
    // Inactive users: anyone not marked active
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', false),
    supabase.from('internships').select('*', { count: 'exact', head: true }),
    supabase.from('applications').select('*', { count: 'exact', head: true }),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .in('role', ['guest', 'university', 'software_house'])
      .eq('approval_status', 'pending'),
    // Pending internship approvals (posts waiting for admin review)
    supabase
      .from('internships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'university'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'software_house'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'guest'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin'),
  ])

  const activeUsers = activeUsersRes.count || 0
  const inactiveUsers = inactiveUsersRes.count || 0
  const studentCount = students.count || 0
  const universityCount = universities.count || 0
  const softwareHouseCount = softwareHouses.count || 0
  const guestCount = guests.count || 0
  const adminCount = adminsRes.count || 0
  const pendingUserCount = pendingUserApprovals.count || 0
  const pendingInternshipCount = pendingInternshipApprovals.count || 0

  return {
    activeUsers,
    inactiveUsers,
    totalInternships: internships.count || 0,
    totalApplications: applications.count || 0,
    // Combined pending approvals: user accounts + internship posts
    pendingApprovals: pendingUserCount + pendingInternshipCount,
    userDistribution: {
      students: studentCount,
      universities: universityCount,
      softwareHouses: softwareHouseCount,
      guests: guestCount,
      admins: adminCount,
    },
  }
}

async function fetchRecentActivity() {
  // Prefer platform-wide activity logs; fallback to admin logs if table not available
  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*, profiles:actor_id(full_name, organization_name, email)')
      .order('timestamp', { ascending: false })
      .limit(5)
    if (error) throw error
    if (data && data.length > 0) return data
  } catch (err) {
    console.warn('[Dashboard] activity_logs not available, falling back to admin_logs:', err?.message)
  }
  // Fallback
  const { data: adminData, error: adminError } = await supabase
    .from('admin_logs')
    .select('*, profiles:admin_id(full_name, organization_name, email)')
    .order('timestamp', { ascending: false })
    .limit(5)
  if (adminError) {
    console.error('[Dashboard] fetchRecentActivity fallback error:', adminError)
    throw adminError
  }
  return adminData || []
}

async function fetchPendingApprovals() {
  // Real pending approvals: accounts that still need admin review
  const { data, error } = await supabase
    .from('profiles')
    // Mirror the same filter logic as PendingAccounts, but limited to a few rows
    .select('*')
    .or('role.eq.software_house,role.eq.guest,role.eq.university')
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(3)

  if (error) throw error
  return data || []
}

async function fetchInternshipTrends() {
  // Get internships created in the last 6 months
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  
  const { data, error } = await supabase
    .from('internships')
    .select('created_at')
    .gte('created_at', sixMonthsAgo.toISOString())
    .order('created_at', { ascending: true })

  if (error) throw error

  // Group by month
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const trends = {}
  
  // Initialize last 6 months with 0
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${monthNames[date.getMonth()]} ${date.getFullYear()}`
    trends[key] = 0
  }

  // Count internships per month
  ;(data || []).forEach(internship => {
    const date = new Date(internship.created_at)
    const key = `${monthNames[date.getMonth()]} ${date.getFullYear()}`
    if (trends.hasOwnProperty(key)) {
      trends[key] = (trends[key] || 0) + 1
    }
  })

  // Convert to array format for display (last 6 months)
  const trendArray = Object.entries(trends).map(([month, count]) => ({
    month: month.split(' ')[0], // Just the month name
    count
  }))

  return trendArray
}

export default function AdminDashboard() {
  const queryClient = useQueryClient()
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: fetchStats,
  })

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['admin-activity'],
    queryFn: fetchRecentActivity,
  })

  const { data: pendingApprovals, isLoading: pendingLoading } = useQuery({
    queryKey: ['admin-pending-approvals-dashboard'],
    queryFn: fetchPendingApprovals,
  })

  const { data: internshipTrends, isLoading: trendsLoading } = useQuery({
    queryKey: ['admin-internship-trends'],
    queryFn: fetchInternshipTrends,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  })

  // Row-level loading state for approve/reject actions
  const [actionPendingId, setActionPendingId] = useState(null)
  const [actionPendingType, setActionPendingType] = useState(null)
  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmUser, setConfirmUser] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  // Realtime: refresh pending approvals and recent activity when data changes
  useEffect(() => {
    const profilesChannel = supabase
      .channel('admin-dashboard-pending-approvals')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          queryClient.invalidateQueries(['admin-pending-approvals-dashboard'])
          queryClient.invalidateQueries(['admin-stats'])
        },
      )
      .subscribe()

    const activityChannel = supabase
      .channel('admin-dashboard-activity')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_logs',
        },
        () => {
          queryClient.invalidateQueries(['admin-activity'])
        },
      )
      .subscribe()

    // Real-time subscription for internship trends
    const internshipsChannel = supabase
      .channel('admin-dashboard-internships')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'internships',
        },
        () => {
          queryClient.invalidateQueries(['admin-internship-trends'])
          queryClient.invalidateQueries(['admin-stats'])
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(profilesChannel)
      supabase.removeChannel(activityChannel)
      supabase.removeChannel(internshipsChannel)
    }
  }, [queryClient])

  if (statsLoading) return <Spinner />

  const { activeUsers, inactiveUsers, totalInternships, totalApplications, pendingApprovals: pendingCount, userDistribution } =
    stats || {}

  const totalForDistribution =
    (userDistribution?.students || 0) +
    (userDistribution?.universities || 0) +
    (userDistribution?.softwareHouses || 0) +
    (userDistribution?.guests || 0) +
    (userDistribution?.admins || 0) || 1

  const pct = (value) => Math.round(((value || 0) / totalForDistribution) * 100)

  const handleStubAction = async (action, item) => {
    // Delegate to real PendingAccounts logic by updating profiles + logging
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          approval_status: action === 'Approve' ? 'approved' : 'rejected',
          is_active: action === 'Approve',
        })
        .eq('id', item.id)

      if (error) throw error

      // Log admin action using the utility function
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        await logAdminAction(
          action === 'Approve' ? 'approve_account' : 'reject_account',
          'profile',
          item.id,
          null
        )
      }

      // Send approval/rejection email to user
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || ''
        const apiUrl = backendUrl || (import.meta.env.DEV ? '/api' : '')
        
        const emailResponse = await fetch(`${apiUrl}/api/admin/send-approval-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: item.id,
            action: action === 'Approve' ? 'approve' : 'reject',
            feedback: null,
            userEmail: item.email || null,
            userName: item.full_name || item.organization_name || 'User',
            userRole: item.role || ''
          })
        })

        if (emailResponse.ok) {
          console.log(`[AdminDashboard] ✅ ${action === 'Approve' ? 'Approval' : 'Rejection'} email sent successfully`)
        } else {
          const errorData = await emailResponse.json().catch(() => ({}))
          console.warn(`[AdminDashboard] ⚠️  Failed to send ${action} email:`, errorData.error || 'Unknown error')
          // Don't throw error - email failure shouldn't block approval/rejection
        }
      } catch (emailErr) {
        console.warn(`[AdminDashboard] ⚠️  Exception sending ${action} email:`, emailErr.message)
        // Don't throw error - email failure shouldn't block approval/rejection
      }

      queryClient.invalidateQueries(['admin-pending-approvals-dashboard'])
      queryClient.invalidateQueries(['pending-accounts'])
      toast.success(`Account ${action === 'Approve' ? 'approved' : 'rejected'} successfully`)
    } catch (err) {
      console.error('[AdminDashboard] approval error', err)
      toast.error(err.message || 'Failed to update account')
    }
  }

  const handleApproveClick = (item) => {
    setConfirmUser(item)
    setConfirmAction('approve')
    setShowConfirmModal(true)
  }

  const handleRejectClick = (item) => {
    setConfirmUser(item)
    setConfirmAction('reject')
    setShowConfirmModal(true)
  }

  const executeConfirmedAction = async () => {
    if (!confirmUser || !confirmAction) return

    try {
      setConfirmLoading(true)
      setActionPendingId(confirmUser.id)
      setActionPendingType(confirmAction)
      
      await handleStubAction(confirmAction === 'approve' ? 'Approve' : 'Reject', confirmUser)
      
      setShowConfirmModal(false)
      setConfirmUser(null)
      setConfirmAction(null)
    } catch (err) {
      console.error('[AdminDashboard] Confirmation action error:', err)
      toast.error(err.message || 'Failed to process action')
    } finally {
      setConfirmLoading(false)
      setActionPendingId(null)
      setActionPendingType(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header aligned with User Management (colored panel) */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-blue-600">Admin Dashboard</h1>
            <p className="text-sm text-gray-600 mt-1">
              Monitor key metrics, review user distribution, and track recent platform activity.
            </p>
          </div>
          {/* Right side can host filters or quick actions in future */}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center" />
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Active Users (blue) */}
        <div className="rounded-xl shadow p-6 text-white bg-gradient-to-br from-blue-600 to-blue-500">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-white/90">Active Users</h3>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <p className="text-3xl font-bold">{activeUsers || 0}</p>
          <p className="text-sm text-white/80 mt-1">+5% from last month</p>
        </div>

        {/* Inactive Users (dark/gray) */}
        <div className="rounded-xl shadow p-6 text-white bg-gradient-to-br from-gray-700 to-gray-800">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-white/90">Inactive Users</h3>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17h10M5 12h14M7 7h10" />
            </svg>
          </div>
          <p className="text-3xl font-bold">{inactiveUsers || 0}</p>
          <p className="text-sm text-white/80 mt-1">Status: not active</p>
        </div>

        {/* Total Internships (orange) */}
        <div className="rounded-xl shadow p-6 text-white bg-gradient-to-br from-orange-500 to-orange-600">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-white/90">Total Internships</h3>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <p className="text-3xl font-bold">{totalInternships || 0}</p>
          <p className="text-sm text-white/80 mt-1">+2% from last month</p>
        </div>

        {/* Total Applications (purple) */}
        <div className="rounded-xl shadow p-6 text-white bg-gradient-to-br from-purple-500 to-purple-600">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-white/90">Total Applications</h3>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <p className="text-3xl font-bold">{totalApplications || 0}</p>
          <p className="text-sm text-white/80 mt-1">+8% from last month</p>
        </div>

        {/* Pending Approvals (green to match UM vibrant set or yellow?) Use green for contrast */}
        <div className="rounded-xl shadow p-6 text-white bg-gradient-to-br from-green-600 to-green-500">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-white/90">Pending Approvals</h3>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
            </svg>
          </div>
          <p className="text-3xl font-bold">{pendingCount || 0}</p>
          <p className="text-sm text-white/80 mt-1">↓1% from last week</p>
        </div>
      </div>

      {/* Middle row: User Distribution + Internship Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">User Distribution</h2>
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            {/* Simple ring chart placeholder */}
          <div className="flex-1 flex items-center justify-center">
            <div className="relative w-40 h-40">
              <div className="absolute inset-0 rounded-full bg-gray-100" />
              {/* Colored segments as simple overlay arcs */}
              <div className="absolute inset-2 rounded-full border-[12px] border-transparent border-t-blue-500 border-l-blue-500 rotate-0" />
              <div className="absolute inset-2 rounded-full border-[12px] border-transparent border-b-green-500 rotate-45" />
              <div className="absolute inset-2 rounded-full border-[12px] border-transparent border-r-orange-400 rotate-90" />
              <div className="absolute inset-2 rounded-full border-[12px] border-transparent border-t-purple-500 rotate-[135deg]" />
              <div className="absolute inset-2 rounded-full border-[12px] border-transparent border-l-red-500 rotate-[180deg]" />
              <div className="absolute inset-5 rounded-full bg-white" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-medium text-gray-700">{totalForDistribution || 0} users</span>
              </div>
            </div>
          </div>
          {/* Legend */}
          <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-sm text-gray-700">Students</span>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {userDistribution?.students || 0} ({pct(userDistribution?.students)}%)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-sm text-gray-700">Universities</span>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {userDistribution?.universities || 0} ({pct(userDistribution?.universities)}%)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-orange-400" />
                  <span className="text-sm text-gray-700">Software Houses</span>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {userDistribution?.softwareHouses || 0} ({pct(userDistribution?.softwareHouses)}%)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-purple-500" />
                  <span className="text-sm text-gray-700">Guests</span>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {userDistribution?.guests || 0} ({pct(userDistribution?.guests)}%)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-sm text-gray-700">Admins</span>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {userDistribution?.admins || 0} ({pct(userDistribution?.admins)}%)
                </span>
              </div>
          </div>
        </div>
      </div>

        {/* Internship Trends (real-time chart) */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Internship Trends</h2>
          <p className="text-xs text-gray-500 mb-4">Last 6 months</p>
          {trendsLoading ? (
            <div className="flex items-center justify-center h-40">
              <Spinner />
            </div>
          ) : (
            <div className="flex items-end justify-between h-40 gap-3">
              {internshipTrends && internshipTrends.length > 0 ? (
                internshipTrends.map((trend, idx) => {
                  // Calculate max count for percentage calculation
                  const maxCount = Math.max(...internshipTrends.map(t => t.count), 1)
                  const heightPercentage = maxCount > 0 ? (trend.count / maxCount) * 100 : 0
                  // Minimum height of 10% if there's any data, or 0% if count is 0
                  const displayHeight = trend.count > 0 ? Math.max(heightPercentage, 10) : 0
                  
                  return (
                    <div key={`${trend.month}-${idx}`} className="flex flex-col items-center gap-2 flex-1">
                      <div className="w-full bg-blue-100 rounded-md overflow-hidden h-28 flex items-end relative">
                        <div
                          className="w-full bg-blue-500 rounded-md transition-all duration-500 ease-out"
                          style={{ height: `${displayHeight}%` }}
                          title={`${trend.count} internship${trend.count !== 1 ? 's' : ''}`}
                        />
                        {trend.count > 0 && (
                          <span className="absolute top-1 left-1/2 transform -translate-x-1/2 text-xs font-medium text-blue-700">
                            {trend.count}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">{trend.month}</span>
                    </div>
                  )
                })
              ) : (
                <div className="flex items-center justify-center w-full h-40 text-gray-500 text-sm">
                  No internship data available
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: User Approval Requests + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Approval Requests */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">User Approval Requests</h2>
            <Link
              to="/admin/pending-accounts"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View all
             
        </Link>
          </div>
          {pendingLoading ? (
            <Spinner />
          ) : !pendingApprovals || pendingApprovals.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">No pending approval requests.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b">
                    <th className="py-2 pr-4">User Name</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingApprovals.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <span className="font-medium text-gray-900">
                          {item.full_name || item.organization_name || item.email || item.id.slice(0, 8)}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium capitalize">
                          {item.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-xs text-gray-500">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString() : '--'}
                      </td>
                      <td className="py-3 pr-0">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleApproveClick(item)}
                            disabled={actionPendingId === item.id}
                            className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {actionPendingId === item.id && actionPendingType === 'approve' ? (
                              <span className="inline-flex items-center gap-1">
                                <svg className="w-3 h-3 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                                </svg>
                                Approving...
                              </span>
                            ) : (
                              'Approve'
                            )}
                          </button>
                          <button
                            onClick={() => handleRejectClick(item)}
                            disabled={actionPendingId === item.id}
                            className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {actionPendingId === item.id && actionPendingType === 'reject' ? (
                              <span className="inline-flex items-center gap-1">
                                <svg className="w-3 h-3 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                                </svg>
                                Rejecting...
                              </span>
                            ) : (
                              'Reject'
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recent Platform Activity</h2>
            <Link
              to="/admin/logs"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              View all
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
        </Link>
          </div>
          {activityLoading ? (
            <Spinner />
          ) : (
            <div className="space-y-3">
              {activity && activity.length > 0 ? (
                activity.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        log.action.includes('approve')
                          ? 'bg-green-100'
                          : log.action.includes('reject')
                            ? 'bg-red-100'
                            : 'bg-blue-100'
                      }`}
                    >
                      {log.action.includes('approve') ? (
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : log.action.includes('reject') ? (
                        <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-900">
                        <span className="font-medium">
                          {log.profiles?.full_name ||
                            log.profiles?.organization_name ||
                            log.profiles?.email ||
                            'User'}
                        </span>{' '}
                        {log.action.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-gray-500">
                        {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Unknown time'}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-4">No recent activity</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => {
          setShowConfirmModal(false)
          setConfirmUser(null)
          setConfirmAction(null)
        }}
        title={
          confirmAction === 'approve'
            ? 'Approve Account'
            : 'Reject Account'
        }
        size="small"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            {confirmAction === 'approve' && (
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            )}
            {confirmAction === 'reject' && (
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            )}
            <div className="flex-1">
              <p className="text-sm text-gray-700 mb-2">
                {confirmAction === 'approve' && (
                  <>
                    Are you sure you want to <strong className="text-green-600">approve</strong> this account? The user will be able to log in and access the platform.
                  </>
                )}
                {confirmAction === 'reject' && (
                  <>
                    Are you sure you want to <strong className="text-red-600">reject</strong> this account? This action will prevent the user from accessing the platform.
                  </>
                )}
              </p>
              {confirmUser && (
                <div className="bg-gray-50 rounded-lg p-3 mt-3">
                  <p className="text-sm font-semibold text-gray-900">
                    {confirmUser.full_name || confirmUser.organization_name || confirmUser.email || confirmUser.id.slice(0, 8)}
                  </p>
                  {confirmUser.email && (
                    <p className="text-xs text-gray-600 mt-1">{confirmUser.email}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1 capitalize">
                    Role: {confirmUser.role?.replace('_', ' ')}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={() => {
                setShowConfirmModal(false)
                setConfirmUser(null)
                setConfirmAction(null)
              }}
              disabled={confirmLoading}
              className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={executeConfirmedAction}
              disabled={confirmLoading}
              className={`px-5 py-2.5 rounded-lg text-white font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                confirmAction === 'approve'
                  ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700'
                  : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700'
              }`}
            >
              {confirmLoading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                <>
                  {confirmAction === 'approve' ? 'Approve Account' : 'Reject Account'}
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}