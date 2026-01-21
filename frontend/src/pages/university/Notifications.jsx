import React, { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../utils/supabase'
import Spinner from '../../components/Spinner'
import { useAuth } from '../../context/AuthContext'

function formatAction(action) {
  if (!action) return 'Activity'
  return action.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

function getActionBadge(action) {
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium'
  if (!action) return { className: `${base} bg-gray-100 text-gray-700`, label: 'Activity' }
  if (action.includes('approve')) return { className: `${base} bg-green-100 text-green-700`, label: 'Approved' }
  if (action.includes('reject')) return { className: `${base} bg-red-100 text-red-700`, label: 'Rejected' }
  if (action.includes('update') || action.includes('edit')) return { className: `${base} bg-blue-100 text-blue-700`, label: 'Updated' }
  return { className: `${base} bg-gray-100 text-gray-700`, label: 'Activity' }
}

function formatRelativeTime(date) {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now - d
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
  return 'Just now'
}

async function fetchNotifications(userId) {
  if (!userId) return []
  const { data, error } = await supabase
    .from('admin_logs')
    .select(`
      *,
      profiles:admin_id (
        full_name,
        organization_name,
        email
      )
    `)
    .or(`admin_id.eq.${userId},target_id.eq.${userId}`)
    .order('timestamp', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[Notifications] fetchNotifications error:', error)
    throw error
  }
  return data || []
}

export default function UniversityNotifications() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [myActionsOnly, setMyActionsOnly] = useState(false)

  const {
    data: notifications,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['university-notifications', profile?.id, myActionsOnly],
    queryFn: () => fetchNotifications(profile?.id),
    enabled: !!profile?.id,
  })

  useEffect(() => {
    const channel = supabase
      .channel('university-notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_logs',
        },
        () => {
          queryClient.invalidateQueries(['university-notifications', profile?.id, myActionsOnly])
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient, profile?.id, myActionsOnly])

  const filtered = useMemo(() => {
    const rows = notifications || []
    return rows.filter((n) => {
      // My actions only: require admin_id = me
      if (myActionsOnly && n.admin_id !== profile?.id) return false

      // Action filter
      if (actionFilter !== 'all') {
        const has = n.action?.includes(actionFilter)
        if (!has) return false
      }

      // Type filter
      if (typeFilter !== 'all') {
        const t = n.target_type || 'unknown'
        if (t !== typeFilter) return false
      }

      // Search filter
      if (searchTerm) {
        const s = searchTerm.toLowerCase()
        const adminName =
          n.profiles?.full_name || n.profiles?.organization_name || n.profiles?.email || ''
        const text = [
          adminName,
          n.action,
          n.target_type,
          n.target_id,
          n.feedback,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!text.includes(s)) return false
      }

      return true
    })
  }, [notifications, searchTerm, actionFilter, typeFilter, myActionsOnly, profile?.id])

  const actionTypes = useMemo(() => {
    const rows = notifications || []
    const types = new Set()
    rows.forEach((n) => {
      if (n.action?.includes('approve')) types.add('approve')
      else if (n.action?.includes('reject')) types.add('reject')
      else if (n.action?.includes('update') || n.action?.includes('edit')) types.add('update')
    })
    return Array.from(types)
  }, [notifications])

  const targetTypes = useMemo(() => {
    const rows = notifications || []
    const types = new Set(rows.map((n) => n.target_type || 'unknown').filter(Boolean))
    return Array.from(types)
  }, [notifications])

  if (isLoading) return <Spinner />

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <p className="text-red-800">Error loading notifications: {error.message}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary and controls */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <input
              type="text"
              className="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              placeholder="Search notifications..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Action filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Action</label>
            <select
              className="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="all">All</option>
              {actionTypes.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Type filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <select
              className="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">All</option>
              {targetTypes.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Toggle */}
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={myActionsOnly}
                onChange={(e) => setMyActionsOnly(e.target.checked)}
              />
              Show only my actions
            </label>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {filtered.length} of {notifications?.length || 0}
          </div>
        </div>
        <ul className="divide-y divide-gray-200">
          {filtered.length === 0 ? (
            <li className="px-6 py-10 text-center text-gray-600">No notifications found.</li>
          ) : (
            filtered.map((n) => {
              const badge = getActionBadge(n.action)
              const adminName = n.profiles?.full_name || n.profiles?.organization_name || n.profiles?.email
              return (
                <li key={n.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={badge.className}>{badge.label}</span>
                        <span className="text-sm text-gray-500">{formatRelativeTime(n.timestamp)}</span>
                      </div>
                      <div className="mt-1 text-gray-900 font-medium">
                        {formatAction(n.action)}
                        {n.target_type && (
                          <span className="ml-2 text-gray-600 text-sm">on {n.target_type}</span>
                        )}
                      </div>
                      {n.feedback && (
                        <div className="mt-1 text-gray-700 text-sm">{n.feedback}</div>
                      )}
                      <div className="mt-2 text-sm text-gray-500">
                        {adminName ? `By ${adminName}` : 'By system'}
                      </div>
                    </div>
                    {/* Placeholder for future actions */}
                    <div className="flex items-center gap-2">
                      <button className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100">
                        View details
                      </button>
                    </div>
                  </div>
                </li>
              )
            })
          )}
        </ul>
      </div>
    </div>
  )
}