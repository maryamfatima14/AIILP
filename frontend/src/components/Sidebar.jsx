import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getProfilePictureUrl } from '../utils/api'
import ProfilePictureModal from './ProfilePictureModal'
import logo from '../logos/logo.jpeg'

export default function Sidebar() {
  const { user, profile, signOut } = useAuth()
  const { pathname } = useLocation()
  const role = profile?.role
  const [showModal, setShowModal] = useState(false)

  const isActive = (to) => pathname === to || pathname.startsWith(to + '/')

  // Icon helpers (inline SVG to avoid extra deps)
  const IconDashboard = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6" />
    </svg>
  )
  const IconGrid = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 7v-7h7v7h-7z" />
    </svg>
  )
  const IconUsers = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M12 12a4 4 0 100-8 4 4 0 000 8zm0 0a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
  const IconChart = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3v18M4 13v8m14-14v14m-7-8v8" />
    </svg>
  )
  const IconBell = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  )
  const IconLogs = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v2a2 2 0 002 2h4m4-4V7a2 2 0 00-2-2h-3.5M9 17H7a2 2 0 01-2-2V5a2 2 0 012-2h3.5M9 17h6m0 0h2m-8-6h4m-4-4h1" />
    </svg>
  )
  const IconSettings = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l.7 2.148a1 1 0 00.95.69h2.262c.969 0 1.371 1.24.588 1.81l-1.832 1.334a1 1 0 00-.364 1.118l.7 2.148c.3.921-.755 1.688-1.54 1.118l-1.832-1.334a1 1 0 00-1.175 0l-1.832 1.334c-.784.57-1.838-.197-1.539-1.118l.7-2.148a1 1 0 00-.364-1.118L4.45 7.575c-.783-.57-.38-1.81.588-1.81H7.3a1 1 0 00.95-.69l.8-2.148z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )

  const baseLinksByRole = {
    student: [
      { to: '/dashboard/student', label: 'Dashboard' },
      { to: '/listings', label: 'Internships' },
      { to: '/cv', label: 'CV Form' },
      { to: '/applications', label: 'Applications' },
    ],
    guest: [
      { to: '/dashboard/guest', label: 'Dashboard' },
      { to: '/listings', label: 'Internships' },
      { to: '/cv', label: 'CV Form' },
      { to: '/applications', label: 'Applications' },
    ],
    university: [
      { to: '/dashboard/university', label: 'Dashboard', icon: <IconGrid /> },
      { to: '/university/students', label: 'Students', icon: <IconUsers /> },
      { to: '/university/applications', label: 'Applications', icon: <IconGrid /> },
      { to: '/university/analytics', label: 'Analytics', icon: <IconChart /> },
      { to: '/university/settings', label: 'Settings', icon: <IconSettings /> },
    ],
    software_house: [
      { to: '/dashboard/software-house', label: 'Dashboard' },
      { to: '/internships/new', label: 'Post Internship' },
      { to: '/internships/my', label: 'My Internships' },
      { to: '/applications/manage', label: 'Applicants' },
    ],
  }

  const IconBriefcase = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )

  const adminLinks = [
    { to: '/dashboard/admin', label: 'Dashboard', icon: <IconDashboard /> },
    { to: '/admin/users', label: 'User Management', icon: <IconUsers /> },
    { to: '/admin/pending-accounts', label: 'User Approvals', icon: <IconUsers /> },
    { to: '/admin/pending-internships', label: 'Post Internship Approval', icon: <IconBriefcase /> },
    { to: '/admin/notifications', label: 'Notifications', icon: <IconBell /> },
    { to: '/admin/analytics', label: 'Analytics', icon: <IconChart /> },
    { to: '/admin/logs', label: 'Activity Logs', icon: <IconLogs /> },
    { to: '/admin/settings', label: 'Settings', icon: <IconSettings /> },
  ]

  const links = role === 'admin' ? adminLinks : baseLinksByRole[role] || []

  const renderLink = (link) => {
    const active = isActive(link.to)
    return (
      <Link
        key={link.to}
        to={link.to}
        className={`flex items-center gap-3 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
          active ? 'bg-blue-100 text-blue-600' : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        {link.icon && (
          <span className={active ? 'text-blue-600' : 'text-gray-500'}>{link.icon}</span>
        )}
        <span>{link.label}</span>
      </Link>
    )
  }

  const initials = (user?.email || 'A')[0]?.toUpperCase()
  const email = user?.email || 'admin@aiilp.com'
  const pictureUrl = profile?.profile_picture
    ? getProfilePictureUrl(profile.profile_picture)
    : null
  const userName = profile?.full_name || profile?.organization_name || null

  return (
    <>
      <aside className="w-64 bg-gradient-to-b from-indigo-50 via-blue-50 to-indigo-50 border-r border-indigo-100 shadow-sm h-full flex flex-col justify-between">
        {/* Logo + brand (role-specific) */}
        <div className="px-5 pt-6 pb-4 border-b border-indigo-100">
          <div className="flex items-center gap-3">
            <img src={logo} alt="AIILP logo" className="w-9 h-9 rounded-lg object-cover shadow-sm ring-1 ring-blue-200" />
            <div>
              {role === 'admin' ? (
                <div className="text-base font-semibold text-blue-600">AIILP</div>
              ) : (
                <>
                  <div className="text-base font-semibold text-blue-600">AIILP</div>
                  <div className="text-xs text-gray-600">University Portal</div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 px-3 py-4 overflow-y-auto">
          <nav className="space-y-1">
            {links.map(renderLink)}
          </nav>
        </div>

        {/* Bottom profile + logout */}
        <div className="border-t border-indigo-100 px-5 py-4 bg-white/40 backdrop-blur-sm">
          <button
            onClick={() => setShowModal(true)}
            className="w-full flex items-center gap-3 mb-4 hover:opacity-80 transition-opacity p-2 rounded-lg hover:bg-white/60"
          >
            {pictureUrl ? (
              <div className="relative">
                <img
                  src={pictureUrl}
                  alt="Profile"
                  className="w-10 h-10 rounded-full object-cover border-2 border-blue-200 shadow-sm"
                  onError={(e) => {
                    // Hide broken image and show fallback
                    e.currentTarget.style.display = 'none'
                    const fallback = e.currentTarget.nextElementSibling
                    if (fallback) fallback.style.display = 'flex'
                  }}
                />
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center border-2 border-blue-200 shadow-sm hidden">
                  <span className="text-sm font-semibold text-white">{initials}</span>
                </div>
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center border-2 border-blue-200 shadow-sm">
                <span className="text-sm font-semibold text-white">{initials}</span>
              </div>
            )}
            <div className="flex flex-col text-left flex-1 min-w-0">
              <span className="text-sm font-semibold text-gray-900 truncate">
                {role === 'admin' 
                  ? (profile?.full_name || profile?.organization_name || 'Admin')
                  : role === 'university' 
                    ? (profile?.organization_name || profile?.full_name || 'University')
                    : userName || 'User'
                }
              </span>
              <span className="text-xs text-gray-600 truncate">
                {role === 'admin' 
                  ? 'Admin'
                  : role === 'university'
                    ? 'University'
                    : email
                }
              </span>
            </div>
          </button>
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-medium hover:from-blue-700 hover:to-indigo-700 transition-all shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h4a2 2 0 012 2v1" />
            </svg>
            Logout
          </button>
        </div>
      </aside>

      <ProfilePictureModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        profilePicture={profile?.profile_picture}
        userName={role === 'admin' 
          ? (profile?.full_name || profile?.organization_name || 'Admin')
          : role === 'university' 
            ? (profile?.organization_name || profile?.full_name || 'University')
            : userName || 'User'
        }
        userRole={role || ''}
      />
    </>
  )
}