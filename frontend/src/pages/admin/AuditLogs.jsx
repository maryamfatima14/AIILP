import React, { useEffect, useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../utils/supabase'
import Spinner from '../../components/Spinner'
import { getProfilePictureUrl, getDefaultProfilePictureUrl } from '../../utils/api'

async function fetchAdminLogs() {
  const { data, error } = await supabase
    .from('admin_logs')
    .select(`
      *,
      profiles:admin_id (
        full_name,
        organization_name,
        email,
        role,
        profile_picture
      )
    `)
    .order('timestamp', { ascending: false })
    .limit(200)
  if (error) {
    console.error('[AuditLogs] fetchAdminLogs error:', error)
    throw error
  }
  return data || []
}

async function fetchActivityLogs() {
  const { data, error } = await supabase
    .from('activity_logs')
    .select(`
      *,
      profiles:actor_id (
        full_name,
        organization_name,
        email,
        role,
        profile_picture
      )
    `)
    .order('timestamp', { ascending: false })
    .limit(500)
  if (error) {
    console.warn('[AuditLogs] fetchActivityLogs warning:', error?.message)
    return []
  }
  return data || []
}

// Helper function to format action text
function formatAction(action) {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())
}

// Helper function to get action icon and color
function getActionIcon(action) {
  if (action.includes('approve')) {
    return {
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
      color: 'bg-green-100 text-green-700',
    }
  }
  if (action.includes('reject')) {
    return {
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ),
      color: 'bg-red-100 text-red-700',
    }
  }
  if (action.includes('update') || action.includes('edit')) {
    return {
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
      color: 'bg-blue-100 text-blue-700',
    }
  }
  return {
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    ),
    color: 'bg-gray-100 text-gray-700',
  }
}

// Helper function to format relative time
function formatRelativeTime(date) {
  const now = new Date()
  const diff = now - date
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
  return 'Just now'
}

export default function AuditLogs() {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [targetTypeFilter, setTargetTypeFilter] = useState('all')
  const [page, setPage] = useState(1)
  const pageSize = 10

  const [activeTab, setActiveTab] = useState('platform')
  const { data: adminData, isLoading: adminLoading, error: adminError } = useQuery({
    queryKey: ['admin_logs'],
    queryFn: fetchAdminLogs,
  })
  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['activity_logs'],
    queryFn: fetchActivityLogs,
  })

  // Realtime: refresh logs when either table changes
  useEffect(() => {
    const adminChannel = supabase
      .channel('admin-logs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admin_logs' },
        () => queryClient.invalidateQueries(['admin_logs']),
      )
      .subscribe()

    const activityChannel = supabase
      .channel('activity-logs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activity_logs' },
        () => queryClient.invalidateQueries(['activity_logs']),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(adminChannel)
      supabase.removeChannel(activityChannel)
    }
  }, [queryClient])

  // Choose dataset and loading/error based on active tab
  const currentData = activeTab === 'platform' ? activityData || [] : adminData || []
  const isLoading = activeTab === 'platform' ? activityLoading : adminLoading
  const error = activeTab === 'platform' ? null : adminError

  // Filter logs
  const filteredLogs = useMemo(() => {
    if (!currentData) return []

    return currentData.filter((log) => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase()
        const adminName =
          log.profiles?.full_name || log.profiles?.organization_name || log.profiles?.email || ''
        const matchesSearch =
          adminName.toLowerCase().includes(searchLower) ||
          log.action.toLowerCase().includes(searchLower) ||
          log.target_type?.toLowerCase().includes(searchLower) ||
          log.target_id?.toLowerCase().includes(searchLower) ||
          log.feedback?.toLowerCase().includes(searchLower)

        if (!matchesSearch) return false
      }

      // Action filter
      if (actionFilter !== 'all') {
        if (!log.action.includes(actionFilter)) return false
      }

      // Target type filter (handle missing target_type column)
      if (targetTypeFilter !== 'all') {
        const logTargetType = log.target_type || 'unknown'
        if (logTargetType !== targetTypeFilter) return false
      }

      return true
    })
  }, [currentData, searchTerm, actionFilter, targetTypeFilter])

  const totalPages = Math.max(1, Math.ceil((filteredLogs?.length || 0) / pageSize))
  const clampedPage = Math.min(Math.max(page, 1), totalPages)
  const pageStart = (clampedPage - 1) * pageSize
  const pageLogs = filteredLogs.slice(pageStart, pageStart + pageSize)

  useEffect(() => {
    setPage(1)
  }, [searchTerm, actionFilter, targetTypeFilter, activeTab])

  // Get unique action types and target types for filters
  const actionTypes = useMemo(() => {
    if (!currentData) return []
    const types = new Set()
    currentData.forEach((log) => {
      if (log.action.includes('approve')) types.add('approve')
      else if (log.action.includes('reject')) types.add('reject')
      else if (log.action.includes('update')) types.add('update')
    })
    return Array.from(types)
  }, [currentData])

  const targetTypes = useMemo(() => {
    if (!currentData) return []
    const types = new Set(currentData.map((log) => log.target_type || 'unknown').filter(Boolean))
    return Array.from(types)
  }, [currentData])

  if (isLoading) return <Spinner />

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <p className="text-red-800">Error loading logs: {error.message}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header styled like Dashboard */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-blue-600">Activity Logs</h2>
            <p className="text-sm text-gray-600 mt-1">Review administrative actions and platform activity.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-700">
              Showing {pageLogs.length} of {filteredLogs.length} filtered logs
            </div>
            <div className="flex items-center gap-2 bg-white border border-indigo-100 rounded-lg p-1">
              <button
                className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                  activeTab === 'platform' ? 'bg-blue-600 text-white shadow' : 'text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setActiveTab('platform')}
              >
                Platform Activity
              </button>
              <button
                className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                  activeTab === 'admin' ? 'bg-blue-600 text-white shadow' : 'text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setActiveTab('admin')}
              >
                Admin Actions
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-indigo-100 p-4 bg-gradient-to-r from-indigo-50 via-sky-50 to-purple-50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-indigo-700">Filters</h3>
          <button
            onClick={() => { setSearchTerm(''); setActionFilter('all'); setTargetTypeFilter('all'); }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100"
          >
            Reset
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-indigo-700 mb-2">Search</label>
            <input
              type="text"
              placeholder="Search by admin, action, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Action Filter */}
          <div>
            <label className="block text-sm font-medium text-indigo-700 mb-2">Action Type</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Actions</option>
              {actionTypes.map((type) => (
                <option key={type} value={type}>
                  {formatAction(type)}
                </option>
              ))}
            </select>
          </div>

          {/* Target Type Filter */}
    <div>
            <label className="block text-sm font-medium text-indigo-700 mb-2">Target Type</label>
            <select
              value={targetTypeFilter}
              onChange={(e) => setTargetTypeFilter(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Types</option>
              {targetTypes.map((type) => (
                <option key={type} value={type}>
                  {formatAction(type)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      {!filteredLogs || filteredLogs.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Logs Found</h3>
          <p className="text-gray-600">
            {searchTerm || actionFilter !== 'all' || targetTypeFilter !== 'all'
              ? 'No logs match your filters. Try adjusting your search criteria.'
              : 'Administrative actions will appear here.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden border border-gray-100">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-indigo-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    {activeTab === 'platform' ? 'User' : 'Admin'}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Target
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pageLogs.map((log) => {
                  const actionInfo = getActionIcon(log.action)
                  const timestamp = new Date(log.timestamp)
                  const adminName =
                    log.profiles?.full_name ||
                    log.profiles?.organization_name ||
                    log.profiles?.email ||
                    (activeTab === 'platform'
                      ? log.actor_id?.slice(0, 8)
                      : log.admin_id?.slice(0, 8)) || 'Unknown'

                  return (
                    <tr key={log.id} className="hover:bg-indigo-50/50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-300 flex items-center justify-center overflow-hidden">
                            {log.profiles?.profile_picture ? (
                              <img
                                src={getProfilePictureUrl(log.profiles.profile_picture)}
                                alt="Profile"
                                className="w-full h-full object-cover"
                                onError={(e) => { e.currentTarget.src = getDefaultProfilePictureUrl() }}
                              />
                            ) : (
                              <span
                                className={`text-xl ${
                                  (log.profiles?.role || (activeTab === 'admin' ? 'admin' : 'guest')) === 'admin' ? 'text-red-600' :
                                  (log.profiles?.role || (activeTab === 'admin' ? 'admin' : 'guest')) === 'student' ? 'text-blue-600' :
                                  (log.profiles?.role || (activeTab === 'admin' ? 'admin' : 'guest')) === 'university' ? 'text-amber-600' :
                                  (log.profiles?.role || (activeTab === 'admin' ? 'admin' : 'guest')) === 'software_house' ? 'text-emerald-600' :
                                  (log.profiles?.role || (activeTab === 'admin' ? 'admin' : 'guest')) === 'guest' ? 'text-gray-500' :
                                  'text-gray-600'
                                }`}
                                role="img"
                                aria-label={`${(log.profiles?.role || (activeTab === 'admin' ? 'admin' : 'user'))} icon`}
                              >
                                {(() => {
                                  const role = log.profiles?.role || (activeTab === 'admin' ? 'admin' : 'guest')
                                  return role === 'admin' ? '👑' :
                                    role === 'student' ? '🎓' :
                                    role === 'university' ? '🏫' :
                                    role === 'software_house' ? '💻' :
                                    role === 'guest' ? '👤' : '👤'
                                })()}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col">
                            <div className="text-sm font-medium text-gray-900">{adminName}</div>
                            {log.profiles?.email && log.profiles?.email !== adminName && (
                              <div className="text-xs text-gray-500">{log.profiles.email}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-700 border border-blue-200">
                          {(log.profiles?.role || (activeTab === 'admin' ? 'admin' : 'guest')).replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${actionInfo.color}`}
                        >
                          {actionInfo.icon}
                          {formatAction(log.action)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 capitalize">
                          {log.target_type || (log.action.includes('internship') ? 'internship' : log.action.includes('account') || log.action.includes('profile') ? 'profile' : 'system')}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {log.feedback ? (
                          <div className="text-sm text-gray-900 max-w-xs truncate" title={log.feedback}>
                            {log.feedback}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatRelativeTime(timestamp)}</div>
                        <div className="text-xs text-gray-500">{timestamp.toLocaleString()}</div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50">
            <div className="text-sm text-gray-700">Page {clampedPage} of {totalPages}</div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={clampedPage === 1}
                className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 disabled:opacity-50 hover:bg-white"
              >
                Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`px-3 py-1.5 rounded-md text-sm ${
                    n === clampedPage ? 'bg-blue-600 text-white' : 'border border-gray-300 text-gray-700'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={clampedPage === totalPages}
                className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 disabled:opacity-50 hover:bg-white"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}