import React, { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../utils/supabase'
import Spinner from '../../components/Spinner'
import Modal from '../../components/Modal'
import toast from 'react-hot-toast'
import { getProfilePictureUrl, getDefaultProfilePictureUrl } from '../../utils/api'

// Backend URL handling: use relative /api in dev via Vite proxy
const apiUrl = (path) => {
  const isDev = Boolean(import.meta.env && import.meta.env.DEV)
  if (isDev) return path
  const backendUrl = (import.meta.env && import.meta.env.VITE_BACKEND_URL) || ''
  return backendUrl ? `${backendUrl}${path}` : path
}

async function parseJsonSafe(res) {
  const contentType = res.headers.get('content-type') || ''
  const text = await res.text()
  if (contentType.includes('application/json')) {
    try {
      const json = JSON.parse(text)
      // Return the JSON even if it has an error field - let the caller handle it
      return json
    } catch (e) {
      // If it's already an Error, rethrow it
      if (e instanceof Error) throw e
      throw new Error('Invalid JSON response')
    }
  }
  // Try to extract error from HTML response
  const snippet = (text || '').slice(0, 200)
  throw new Error(snippet || res.statusText || 'Unexpected non-JSON response')
}

async function fetchUserDistribution() {
  const [students, universities, softwareHouses, guests, admins] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'university'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'software_house'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'guest'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin'),
  ])

  return {
    students: students.count || 0,
    universities: universities.count || 0,
    software_houses: softwareHouses.count || 0,
    guests: guests.count || 0,
    admins: admins.count || 0,
  }
}

async function fetchUsers({ queryKey }) {
  const [_key, { role, search }] = queryKey
  let query = supabase
    .from('profiles')
    .select('id, role, university_id, full_name, organization_name, email, approval_status, is_active, created_at, profile_picture')
    .order('created_at', { ascending: false })

  if (role && role !== 'all') {
    query = query.eq('role', role)
  }
  if (search) {
    // Simple search on id text representation
    query = query.ilike('id', `%${search}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

async function fetchUserActivity() {
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
    .eq('target_type', 'profile')
    .order('timestamp', { ascending: false })
    .limit(10)

  if (error) {
    console.error('[UserManagement] fetchUserActivity error:', error)
    throw error
  }
  return data || []
}

async function fetchUniversitiesMap() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, organization_name, full_name, email')
    .eq('role', 'university')
  if (error) throw error
  return data || []
}

export default function UserManagement() {
  const [roleFilter, setRoleFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [currentRole, setCurrentRole] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newUser, setNewUser] = useState({ full_name: '', email: '', password: '', role: 'university', organization_name: '' })
  const [editingUser, setEditingUser] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmUser, setConfirmUser] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [viewingUser, setViewingUser] = useState(null)
  const [showViewModal, setShowViewModal] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Filters must be defined before useQuery that uses it
  const filters = useMemo(
    () => ({
      role: roleFilter,
      search: searchTerm.trim(),
    }),
    [roleFilter, searchTerm],
  )

  const {
    data: distribution,
    isLoading: distLoading,
    refetch: refetchDistribution,
  } = useQuery({
    queryKey: ['admin-users-distribution'],
    queryFn: fetchUserDistribution,
  })

  const {
    data: users,
    isLoading: usersLoading,
    refetch: refetchUsers,
  } = useQuery({
    queryKey: ['admin-users', filters],
    queryFn: fetchUsers,
  })

  const { data: universitiesMapData, isLoading: universitiesLoading } = useQuery({
    queryKey: ['admin-universities-map'],
    queryFn: fetchUniversitiesMap,
  })

  const universityNameMap = useMemo(() => {
    const map = {}
    ;(universitiesMapData || []).forEach((u) => {
      map[u.id] = u.organization_name || u.full_name || u.email || u.id
    })
    return map
  }, [universitiesMapData])

  // Pagination derived state - NOW users is declared, so these can safely reference it
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((users?.length || 0) / pageSize)),
    [users, pageSize],
  )
  const clampedPage = useMemo(
    () => Math.min(Math.max(page, 1), totalPages),
    [page, totalPages],
  )
  const pageUsers = useMemo(() => {
    const start = (clampedPage - 1) * pageSize
    return (users || []).slice(start, start + pageSize)
  }, [users, clampedPage, pageSize])
  const pageButtons = useMemo(() => {
    const pages = []
    const maxButtons = 7
    const makeBtn = (n, label) => (
      <button
        key={`${label || n}`}
        onClick={() => typeof n === 'number' && setPage(n)}
        disabled={label === '…'}
        className={`px-3 py-1.5 rounded-md text-sm ${
          n === clampedPage ? 'bg-blue-600 text-white' : 'border border-gray-300 text-gray-700'
        } ${label === '…' ? 'cursor-default opacity-60' : ''}`}
      >
        {label || n}
      </button>
    )
    const addRange = (start, end) => {
      for (let i = start; i <= end; i++) pages.push(makeBtn(i))
    }
    if (totalPages <= maxButtons) {
      addRange(1, totalPages)
    } else {
      const showLeft = Math.max(1, clampedPage - 1)
      const showRight = Math.min(totalPages, clampedPage + 1)
      pages.push(makeBtn(1))
      if (showLeft > 2) pages.push(makeBtn(null, '…'))
      addRange(showLeft, showRight)
      if (showRight < totalPages - 1) pages.push(makeBtn(null, '…'))
      pages.push(makeBtn(totalPages))
    }
    return <>{pages}</>
  }, [clampedPage, totalPages])

  // Reset pagination when filters change
  useEffect(() => {
    setPage(1)
  }, [roleFilter, searchTerm])

  const {
    data: activity,
    isLoading: activityLoading,
    refetch: refetchActivity,
  } = useQuery({
    queryKey: ['admin-users-activity'],
    queryFn: fetchUserActivity,
  })

  // Realtime subscriptions: keep distribution, users, and activity in sync with DB
  useEffect(() => {
    // Load current profile role
    const loadRole = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData?.session?.access_token
        const { data: { user } } = await supabase.auth.getUser(token)
        if (user?.id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle()
          setCurrentRole(profile?.role || null)
        }
      } catch (e) {
        console.error('Failed to load current role', e)
      }
    }
    loadRole()

    // Listen for changes in profiles (user changes)
    const profilesChannel = supabase
      .channel('admin-users-profiles')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          refetchDistribution()
          refetchUsers()
        },
      )
      .subscribe()

    // Listen for changes in admin_logs related to profiles
    const logsChannel = supabase
      .channel('admin-users-logs')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_logs',
          filter: 'target_type=eq.profile',
        },
        () => {
          refetchActivity()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(profilesChannel)
      supabase.removeChannel(logsChannel)
    }
  }, [refetchDistribution, refetchUsers, refetchActivity])

  const total =
    (distribution?.students || 0) +
    (distribution?.universities || 0) +
    (distribution?.software_houses || 0) +
    (distribution?.guests || 0) +
    (distribution?.admins || 0) || 1

  const pct = (value) => Math.round(((value || 0) / total) * 100)

  const handleUserAction = (action, user) => {
    console.log(`[Admin UserManagement] ${action} for`, user)
    toast.success(`This is a demo. ${action} for user ${user.id.slice(0, 8)} will be logged in admin logs.`)
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    if (creating) return
    try {
      setCreating(true)
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error('Unauthorized')

      const res = await fetch(apiUrl('/api/admin/create-user'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: newUser.email.trim(),
          password: newUser.password,
          full_name: newUser.full_name.trim(),
          role: newUser.role,
          organization_name: newUser.role === 'software_house' ? newUser.organization_name.trim() : undefined,
        }),
      })
      
      if (!res.ok) {
        const json = await parseJsonSafe(res).catch(() => ({ error: `Server error: ${res.status} ${res.statusText}` }))
        const errorMsg = json.error || `Failed to create user: ${res.status} ${res.statusText}`
        if (json.code === 'SERVICE_ROLE_KEY_MISSING') {
          throw new Error('Backend configuration error: Service role key is not configured. Please check backend server logs and configure SUPABASE_SERVICE_ROLE_KEY in backend/.env file.')
        }
        throw new Error(errorMsg)
      }
      
      const json = await parseJsonSafe(res)
      const roleLabel = newUser.role === 'university' ? 'University' : 'Software House'
      toast.success(`${roleLabel} user created successfully! Invitation email sent.`)
      setNewUser({ full_name: '', email: '', password: '', role: 'university', organization_name: '' })
      setShowCreateModal(false)
      setShowPassword(false)
      refetchDistribution()
      refetchUsers()
    } catch (err) {
      console.error('[Create User] Error:', err)
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        toast.error('Cannot connect to server. Please ensure the backend server is running on port 3001.')
      } else {
        toast.error(err.message || 'Failed to create user')
      }
    } finally {
      setCreating(false)
    }
  }

  const openEdit = (u) => {
    setEditingUser({ id: u.id, full_name: u.full_name || '', role: u.role })
  }

  const handleSaveEdit = async () => {
    if (!editingUser) return
    try {
      setSavingEdit(true)
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error('Unauthorized')

      const res = await fetch(apiUrl(`/api/admin/users/${editingUser.id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          full_name: editingUser.full_name,
          role: editingUser.role,
        }),
      })
      
      if (!res.ok) {
        const json = await parseJsonSafe(res).catch(() => ({ error: `Server error: ${res.status} ${res.statusText}` }))
        const errorMsg = json.error || `Failed to update user: ${res.status} ${res.statusText}`
        if (json.code === 'SERVICE_ROLE_KEY_MISSING') {
          throw new Error('Backend configuration error: Service role key is not configured. Please check backend server logs and configure SUPABASE_SERVICE_ROLE_KEY in backend/.env file.')
        }
        throw new Error(errorMsg)
      }
      
      const json = await parseJsonSafe(res)
      toast.success('User updated')
      setEditingUser(null)
      refetchUsers()
    } catch (err) {
      console.error('[Edit User] Error:', err)
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        toast.error('Cannot connect to server. Please ensure the backend server is running on port 3001.')
      } else {
        toast.error(err.message || 'Failed to update user')
      }
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDeleteUser = (u) => {
    if (!u || !u.id) {
      console.error('[handleDeleteUser] Invalid user object:', u)
      toast.error('Invalid user data')
      return
    }
    setConfirmUser(u)
    setConfirmAction('delete')
    setShowConfirmModal(true)
  }

  const handleDeactivateUser = (u) => {
    if (!u || !u.id) {
      console.error('[handleDeactivateUser] Invalid user object:', u)
      toast.error('Invalid user data')
      return
    }
    setConfirmUser(u)
    setConfirmAction('deactivate')
    setShowConfirmModal(true)
  }

  const handleActivateUser = (u) => {
    if (!u || !u.id) {
      console.error('[handleActivateUser] Invalid user object:', u)
      toast.error('Invalid user data')
      return
    }
    setConfirmUser(u)
    setConfirmAction('activate')
    setShowConfirmModal(true)
  }

  const executeConfirmedAction = async () => {
    if (!confirmUser || !confirmAction) return

    try {
      setConfirmLoading(true)
      if (!confirmUser.id) {
        throw new Error('Invalid user: missing user ID')
      }
      
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error('Unauthorized')

      const userId = confirmUser.id
      console.log(`[${confirmAction}] Executing action for user:`, userId)

      let res
      if (confirmAction === 'delete') {
        res = await fetch(apiUrl(`/api/admin/users/${userId}`), {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        })
      } else if (confirmAction === 'deactivate') {
        res = await fetch(apiUrl(`/api/admin/users/${userId}/deactivate`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}), // Explicit empty body
        })
      } else if (confirmAction === 'activate') {
        res = await fetch(apiUrl(`/api/admin/users/${userId}/activate`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}), // Explicit empty body
        })
      } else {
        throw new Error(`Unknown action: ${confirmAction}`)
      }

      if (!res) {
        throw new Error('No response from server')
      }

      if (!res.ok) {
        const json = await parseJsonSafe(res).catch(() => ({ error: `Server error: ${res.status} ${res.statusText}` }))
        console.error(`[${confirmAction}] Server error response:`, json)
        const errorMsg = json.error || `Failed to ${confirmAction} user: ${res.status} ${res.statusText}`
        if (json.code === 'SERVICE_ROLE_KEY_MISSING') {
          throw new Error('Backend configuration error: Service role key is not configured. Please check backend server logs and configure SUPABASE_SERVICE_ROLE_KEY in backend/.env file.')
        }
        throw new Error(errorMsg)
      }
      
      const json = await parseJsonSafe(res)
      console.log(`[${confirmAction}] Success response:`, json)

      if (confirmAction === 'delete') {
        toast.success('User deleted successfully')
        refetchDistribution()
      } else if (confirmAction === 'deactivate') {
        toast.success('User deactivated. They cannot log in now.')
      } else if (confirmAction === 'activate') {
        toast.success('User activated. Login enabled.')
      }
      
      refetchUsers()
      setShowConfirmModal(false)
      setConfirmUser(null)
      setConfirmAction(null)
    } catch (err) {
      console.error(`[${confirmAction} user] Error:`, err)
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        toast.error('Cannot connect to server. Please ensure the backend server is running on port 3001.')
      } else {
        toast.error(err.message || `Failed to ${confirmAction} user`)
      }
    } finally {
      setConfirmLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 shadow-lg border border-blue-100">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              User Management
            </h1>
            <p className="text-sm text-gray-600 mt-2">
              View user distribution, monitor registrations, and review recent user-related activity.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            {currentRole === 'admin' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold shadow-md hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 transform hover:scale-105"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Users
              </button>
            )}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm hover:shadow-md transition-shadow"
            >
              <option value="all">All Roles</option>
              <option value="student">Students</option>
              <option value="university">Universities</option>
              <option value="software_house">Software Houses</option>
              <option value="guest">Guests</option>
              <option value="admin">Admins</option>
            </select>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by user ID..."
                className="w-64 pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm hover:shadow-md transition-shadow"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {distLoading ? (
          <div className="col-span-full">
            <Spinner />
          </div>
        ) : (
          [
            { 
              key: 'students', 
              label: 'Students', 
              gradient: 'from-blue-500 to-blue-600',
              icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              )
            },
            { 
              key: 'universities', 
              label: 'Universities', 
              gradient: 'from-green-500 to-emerald-600',
              icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              )
            },
            { 
              key: 'software_houses', 
              label: 'Software Houses', 
              gradient: 'from-orange-500 to-amber-600',
              icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              )
            },
            { 
              key: 'guests', 
              label: 'Guests', 
              gradient: 'from-purple-500 to-violet-600',
              icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              )
            },
            { 
              key: 'admins', 
              label: 'Admins', 
              gradient: 'from-gray-700 to-gray-800',
              icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              )
            },
          ].map((row) => {
            const value = distribution?.[row.key] || 0
            const percent = pct(value)
            return (
              <div
                key={row.key}
                className={`bg-gradient-to-br ${row.gradient} rounded-xl p-6 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 bg-white/20 rounded-lg backdrop-blur-sm`}>
                    {row.icon}
                  </div>
                  <span className="text-3xl font-bold">{value}</span>
                </div>
                <h3 className="text-sm font-semibold mb-2 opacity-90">{row.label}</h3>
                <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-white rounded-full transition-all duration-500" 
                    style={{ width: `${percent}%` }} 
                  />
                </div>
                <p className="text-xs mt-2 opacity-75">{percent}% of total</p>
              </div>
            )
          })
        )}
      </div>


      {/* User table */}
      <div className="bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Users</h2>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-sm font-medium text-gray-700 shadow-sm">
                Total: <span className="text-blue-600 font-bold">{users?.length || 0}</span>
              </span>
              <span className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-sm font-medium text-blue-700">
                Page: {pageSize}
              </span>
            </div>
          </div>
        </div>
        <div className="p-6">
          {usersLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : !users || users.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="mt-4 text-sm text-gray-500 font-medium">No users found for the selected filters.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto w-full">
                <table className="min-w-max">
                  <thead>
                    <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">User</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Role</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">University</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Created</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {pageUsers.map((u, index) => (
                      <tr 
                        key={u.id} 
                        className={`hover:bg-blue-50/50 transition-colors duration-150 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-300 flex items-center justify-center overflow-hidden">
                              {u.profile_picture ? (
                                <img
                                  src={getProfilePictureUrl(u.profile_picture)}
                                  alt="Profile"
                                  className="w-full h-full object-cover"
                                  onError={(e) => { e.currentTarget.src = getDefaultProfilePictureUrl() }}
                                />
                              ) : (
                                <span
                                  className={`text-xl ${
                                    u.role === 'admin' ? 'text-red-600' :
                                    u.role === 'student' ? 'text-blue-600' :
                                    u.role === 'university' ? 'text-amber-600' :
                                    u.role === 'software_house' ? 'text-emerald-600' :
                                    u.role === 'guest' ? 'text-gray-500' :
                                    'text-gray-600'
                                  }`}
                                  role="img"
                                  aria-label={`${u.role || 'user'} icon`}
                                >
                                  {u.role === 'admin' ? '👑' :
                                   u.role === 'student' ? '🎓' :
                                   u.role === 'university' ? '🏫' :
                                   u.role === 'software_house' ? '💻' :
                                   u.role === 'guest' ? '👤' : '👤'}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-gray-900">
                                {u.full_name || u.organization_name || u.email || u.id.slice(0, 8)}
                              </span>
                              {u.email && (
                                <span className="text-xs text-gray-500 truncate max-w-xs mt-0.5">{u.email}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-700 border border-blue-200">
                            {u.role.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            {u.approval_status === 'pending' && (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-yellow-100 to-amber-100 text-yellow-800 border border-yellow-200">
                                Pending
                              </span>
                            )}
                            {u.approval_status === 'approved' && (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 border border-green-200">
                                Approved
                              </span>
                            )}
                            {u.approval_status === 'rejected' && (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-red-100 to-rose-100 text-red-800 border border-red-200">
                                Rejected
                              </span>
                            )}
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                              u.is_active 
                                ? 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 border border-green-200' 
                                : 'bg-gray-100 text-gray-600 border border-gray-200'
                            }`}>
                              {u.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {u.university_id ? (
                            <span className="font-semibold text-gray-800">
                              {universityNameMap[u.university_id] || '—'}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : '--'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => {
                                setViewingUser(u)
                                setShowViewModal(true)
                              }}
                              className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 hover:border-blue-400 transition-all"
                              title="View user details"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => openEdit(u)}
                              className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all"
                              title="Edit user"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            {u.is_active ? (
                              <button
                                onClick={() => handleDeactivateUser(u)}
                                className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-r from-red-50 to-rose-50 text-red-600 hover:from-red-100 hover:to-rose-100 border border-red-200 transition-all"
                                title="Deactivate user"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleActivateUser(u)}
                                className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 hover:from-green-100 hover:to-emerald-100 border border-green-200 transition-all"
                                title="Activate user"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-r from-red-50 to-rose-50 text-red-600 hover:from-red-100 hover:to-rose-100 border border-red-200 transition-all"
                              title="Delete user"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-700">
                    Page <span className="font-bold text-blue-600">{clampedPage}</span> of <span className="font-bold text-blue-600">{totalPages}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={clampedPage === 1}
                      className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow"
                    >
                      Prev
                    </button>
                    {pageButtons}
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={clampedPage === totalPages}
                      className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
          </>
        )}
        </div>
      </div>

      {/* Create Users Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setNewUser({ full_name: '', email: '', password: '', role: 'university', organization_name: '' })
          setShowPassword(false)
        }}
        title="Create Users"
        size="medium"
      >
        <form onSubmit={handleCreateUser} className="space-y-5">
         

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newUser.full_name}
              onChange={(e) => setNewUser((s) => ({ ...s, full_name: e.target.value }))}
              required
              placeholder="Enter full name"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser((s) => ({ ...s, email: e.target.value }))}
              required
              placeholder={newUser.role === 'university' ? 'university@example.com' : 'softwarehouse@example.com'}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newUser.password}
                onChange={(e) => setNewUser((s) => ({ ...s, password: e.target.value }))}
                required
                placeholder="Enter password (min. 6 characters)"
                minLength={6}
                className="w-full px-4 py-2.5 pr-10 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Password must be at least 6 characters long</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Role <span className="text-red-500">*</span>
            </label>
            <select
              value={newUser.role}
              onChange={(e) => setNewUser((s) => ({ ...s, role: e.target.value, organization_name: '' }))}
              required
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
            >
              <option value="university">University</option>
              <option value="software_house">Software House</option>
            </select>
          </div>

          {newUser.role === 'software_house' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Organization Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newUser.organization_name}
                onChange={(e) => setNewUser((s) => ({ ...s, organization_name: e.target.value }))}
                required={newUser.role === 'software_house'}
                placeholder="Enter organization name"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => {
                setShowCreateModal(false)
                setNewUser({ full_name: '', email: '', password: '', role: 'university', organization_name: '' })
                setShowPassword(false)
              }}
              className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
            >
              {creating ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating...
                </span>
              ) : (
                'Create User'
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => {
          setShowConfirmModal(false)
          setConfirmUser(null)
          setConfirmAction(null)
        }}
        title={
          confirmAction === 'delete'
            ? 'Delete User'
            : confirmAction === 'deactivate'
            ? 'Deactivate User'
            : 'Activate User'
        }
        size="small"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            {confirmAction === 'delete' && (
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
            )}
            {(confirmAction === 'deactivate' || confirmAction === 'activate') && (
              <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                confirmAction === 'deactivate' ? 'bg-yellow-100' : 'bg-green-100'
              }`}>
                {confirmAction === 'deactivate' ? (
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
            )}
            <div className="flex-1">
              <p className="text-sm text-gray-700 mb-2">
                {confirmAction === 'delete' && (
                  <>
                    Are you sure you want to <strong className="text-red-600">delete</strong> this user? This action cannot be undone.
                  </>
                )}
                {confirmAction === 'deactivate' && (
                  <>
                    Are you sure you want to <strong className="text-yellow-600">deactivate</strong> this user? They will not be able to log in until reactivated.
                  </>
                )}
                {confirmAction === 'activate' && (
                  <>
                    Are you sure you want to <strong className="text-green-600">activate</strong> this user? They will be able to log in.
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
                confirmAction === 'delete'
                  ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700'
                  : confirmAction === 'deactivate'
                  ? 'bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-700 hover:to-amber-700'
                  : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700'
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
                  {confirmAction === 'delete' && 'Delete User'}
                  {confirmAction === 'deactivate' && 'Deactivate User'}
                  {confirmAction === 'activate' && 'Activate User'}
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-200">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200 rounded-t-xl">
              <h3 className="text-xl font-bold text-gray-900">Edit User</h3>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={editingUser.full_name}
                  onChange={(e) => setEditingUser((s) => ({ ...s, full_name: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role
                </label>
                <select
                  value={editingUser.role}
                  onChange={(e) => setEditingUser((s) => ({ ...s, role: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all"
                >
                  <option value="student">Student</option>
                  <option value="guest">Guest</option>
                  <option value="software_house">Software House</option>
                  <option value="university">University</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => setEditingUser(null)}
                className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View User Modal */}
      {viewingUser && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => {
            setShowViewModal(false)
            setViewingUser(null)
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 px-6 py-5 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">User Details</h2>
                    <p className="text-sm text-gray-600 mt-0.5">View complete user information</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowViewModal(false)
                    setViewingUser(null)
                  }}
                  className="p-2 rounded-lg hover:bg-white/80 transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="space-y-6">
                {/* Profile Picture & Basic Info */}
                <div className="flex flex-col md:flex-row items-start gap-6 pb-6 border-b border-gray-200">
                  <div className="flex-shrink-0">
                    {viewingUser.profile_picture ? (
                      <div className="relative">
                        <img
                          src={getProfilePictureUrl(viewingUser.profile_picture)}
                          alt="Profile"
                          className="w-32 h-32 rounded-2xl object-cover border-4 border-white shadow-xl"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                            const fallback = e.currentTarget.nextElementSibling
                            if (fallback) fallback.style.display = 'flex'
                          }}
                        />
                        <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center border-4 border-white shadow-xl hidden">
                          <span className="text-4xl font-bold text-white">
                            {(viewingUser.full_name || viewingUser.organization_name || viewingUser.email || 'U')[0].toUpperCase()}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center border-4 border-white shadow-xl">
                        <span className="text-4xl font-bold text-white">
                          {(viewingUser.full_name || viewingUser.organization_name || viewingUser.email || 'U')[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-4">
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Name</div>
                      <div className="text-xl font-bold text-gray-900">
                        {viewingUser.full_name || viewingUser.organization_name || 'No name'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email</div>
                      <div className="text-base font-medium text-gray-700">{viewingUser.email || '—'}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Role</div>
                        <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-700 border border-blue-200">
                          {viewingUser.role?.replace('_', ' ') || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl border border-emerald-200">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Approval Status</div>
                        <div className="mt-1">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                            viewingUser.approval_status === 'approved'
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              : viewingUser.approval_status === 'pending'
                              ? 'bg-amber-100 text-amber-700 border border-amber-200'
                              : 'bg-rose-100 text-rose-700 border border-rose-200'
                          }`}>
                            {viewingUser.approval_status ? viewingUser.approval_status.charAt(0).toUpperCase() + viewingUser.approval_status.slice(1) : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Active Status</div>
                        <div className="mt-1">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                            viewingUser.is_active
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              : 'bg-gray-100 text-gray-600 border border-gray-200'
                          }`}>
                            {viewingUser.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Information */}
                <div className="space-y-4">
                  {viewingUser.university_id && (
                    <div className="p-4 bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl border border-purple-200">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                          <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">University</div>
                          <div className="text-sm font-semibold text-gray-900">
                            {universityNameMap[viewingUser.university_id] || '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="p-4 bg-gradient-to-br from-gray-50 to-slate-50 rounded-xl border border-gray-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Account Created</div>
                        <div className="text-sm font-semibold text-gray-900">
                          {viewingUser.created_at ? new Date(viewingUser.created_at).toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          }) : '—'}
                        </div>
                        {viewingUser.created_at && (
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(viewingUser.created_at).toLocaleTimeString('en-US', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">User ID</div>
                        <div className="text-xs font-mono font-medium text-gray-700 bg-white px-2 py-1 rounded border border-gray-200 inline-block">
                          {viewingUser.id}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => {
                  setShowViewModal(false)
                  setViewingUser(null)
                }}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


