import React, { useEffect, useRef, useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLocation, useNavigate } from 'react-router-dom'
import { getProfilePictureUrl, getDefaultProfilePictureUrl } from '../utils/api'
import { supabase } from '../utils/supabase'
import ProfilePictureModal from './ProfilePictureModal'
import { useQuery } from '@tanstack/react-query'

export default function Header() {
  const { user, profile, signOut } = useAuth()
  const [showModal, setShowModal] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchRef = useRef(null)
  const resultsRef = useRef(null)
  const menuRef = useRef(null)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const email = user?.email || 'admin@aiilp.com'
  const initial = email.charAt(0).toUpperCase()
  const pictureUrl = profile?.profile_picture
    ? getProfilePictureUrl(profile.profile_picture)
    : null
  const userName = profile?.full_name || null
  const displayName = userName || (user?.email ? user.email.split('@')[0] : 'Admin Name')

  const pageTitle = (() => {
    if (pathname.startsWith('/dashboard/university')) return 'Dashboard'
    if (pathname.startsWith('/university/students')) return 'Students'
    if (pathname.startsWith('/university/applications')) return 'Applications'
    if (pathname.startsWith('/university/analytics')) return 'Analytics'
    if (pathname.startsWith('/university/settings')) return 'Settings'
    if (pathname.startsWith('/university/students/')) return 'Student Detail'
    return 'Dashboard'
  })()

  // Handle Escape key to close search and menu
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setShowSearchResults(false)
        setSearchQuery('')
        setShowMenu(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])


  // Fetch search results for university
  const { data: searchResults, isLoading: searching } = useQuery({
    queryKey: ['university-search', searchQuery, profile?.id],
    queryFn: async () => {
      if (!searchQuery.trim() || !profile?.id) return { students: [], applications: [], internships: [] }
      
      const query = searchQuery.trim().toLowerCase()
      const results = { students: [], applications: [], internships: [] }

      try {
        // Get all student IDs for this university
        const { data: universityStudents } = await supabase
          .from('students')
          .select('user_id')
          .eq('university_id', profile.id)

        const studentUserIds = universityStudents?.map(s => s.user_id) || []

        if (studentUserIds.length > 0) {
          // Search students (profiles of students enrolled in this university)
          const { data: students } = await supabase
            .from('profiles')
            .select('id, full_name, email, role')
            .in('id', studentUserIds)
            .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
            .limit(5)

          if (students) results.students = students

          // Search applications from university students
          const { data: applications } = await supabase
            .from('applications')
            .select(`
              id,
              status,
              profiles:user_id(full_name, email),
              internships:internship_id(title, description)
            `)
            .in('user_id', studentUserIds)
            .limit(20)

          if (applications) {
            results.applications = applications.filter(app => {
              const userName = app.profiles?.full_name || app.profiles?.email || ''
              const internshipTitle = app.internships?.title || ''
              const internshipDesc = app.internships?.description || ''
              return userName.toLowerCase().includes(query) || 
                     internshipTitle.toLowerCase().includes(query) ||
                     internshipDesc.toLowerCase().includes(query)
            }).slice(0, 5)
          }

          // Get internship IDs from applications
          const internshipIds = applications?.map(a => a.internships?.id).filter(Boolean) || []
          if (internshipIds.length > 0) {
            const uniqueInternshipIds = [...new Set(internshipIds)]
            const { data: internships } = await supabase
              .from('internships')
              .select('id, title, description, status')
              .in('id', uniqueInternshipIds)
              .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
              .limit(5)

            if (internships) results.internships = internships
          }
        }
      } catch (error) {
        console.error('University search error:', error)
      }

      return results
    },
    enabled: searchQuery.trim().length > 0 && !!profile?.id,
    staleTime: 30000,
  })

  const hasResults = useMemo(() => {
    if (!searchResults) return false
    return searchResults.students.length > 0 || searchResults.internships.length > 0 || searchResults.applications.length > 0
  }, [searchResults])

  // Close dropdown on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (showMenu && menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false)
      }
      if (showSearchResults && 
          searchRef.current && 
          !searchRef.current.contains(e.target) &&
          resultsRef.current &&
          !resultsRef.current.contains(e.target)) {
        setShowSearchResults(false)
      }
    }
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [showMenu, showSearchResults])

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value)
    setShowSearchResults(e.target.value.trim().length > 0)
  }

  const handleResultClick = (type, id) => {
    setSearchQuery('')
    setShowSearchResults(false)
    if (type === 'student') {
      navigate(`/university/students`)
    } else if (type === 'internship') {
      navigate(`/university/applications`)
    } else if (type === 'application') {
      navigate(`/university/applications`)
    }
  }

  const roleLabelMap = {
    university: 'University Admin',
    admin: 'Admin',
    student: 'Student',
    guest: 'Guest',
  }
  const displayRole = roleLabelMap[profile?.role] || 'Admin'

  // Get icon for page title
  const getPageIcon = () => {
    if (pathname.startsWith('/dashboard/university') || pathname.startsWith('/university/dashboard')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      )
    }
    if (pathname.startsWith('/university/students')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )
    }
    if (pathname.startsWith('/university/applications')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    }
    if (pathname.startsWith('/university/analytics')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    }
    if (pathname.startsWith('/university/settings')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    }
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    )
  }

  return (
    <>
      <header className="bg-gradient-to-r from-indigo-50 via-blue-50 to-indigo-50 border-b border-indigo-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          {/* Left: Page title with icon */}
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600">
              {getPageIcon()}
            </span>
            <div>
              <h1 className="text-2xl font-bold text-blue-600">{pageTitle}</h1>
              <p className="text-xs text-gray-600 mt-0.5">University Portal</p>
            </div>
          </div>

          {/* Right: Search, notifications, and profile */}
          <div className="flex items-center gap-4">
            {/* Search input */}
            <div className="hidden md:block relative flex-1 max-w-md" ref={searchRef}>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search students, applications, internships..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={() => setShowSearchResults(searchQuery.trim().length > 0)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-indigo-200 bg-white/80 backdrop-blur-sm shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
                </svg>
                {searching && (
                  <svg className="w-4 h-4 text-blue-500 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
              </div>

              {/* Search Results Dropdown */}
              {showSearchResults && searchQuery.trim().length > 0 && (
                <div 
                  ref={resultsRef}
                  className="absolute top-full mt-2 w-full bg-white rounded-xl shadow-xl border border-indigo-100 z-50 max-h-96 overflow-y-auto"
                >
                  {searching ? (
                    <div className="p-4 text-center text-gray-500 text-sm">Searching...</div>
                  ) : hasResults ? (
                    <div className="p-2">
                      {/* Students */}
                      {searchResults.students.length > 0 && (
                        <div className="mb-2">
                          <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Students</div>
                          {searchResults.students.map((student) => (
                            <button
                              key={student.id}
                              onClick={() => handleResultClick('student', student.id)}
                              className="w-full px-3 py-2 text-left hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-3"
                            >
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                                <span className="text-white text-xs font-semibold">
                                  {(student.full_name || student.email || 'S')[0].toUpperCase()}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">
                                  {student.full_name || 'No name'}
                                </div>
                                <div className="text-xs text-gray-500 truncate">{student.email}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Applications */}
                      {searchResults.applications.length > 0 && (
                        <div className="mb-2">
                          <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Applications</div>
                          {searchResults.applications.map((app) => (
                            <button
                              key={app.id}
                              onClick={() => handleResultClick('application', app.id)}
                              className="w-full px-3 py-2 text-left hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-3"
                            >
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">
                                  {app.profiles?.full_name || app.profiles?.email || 'Unknown'}
                                </div>
                                <div className="text-xs text-gray-500 truncate">{app.internships?.title || 'N/A'}</div>
                                <div className={`text-xs mt-1 inline-block px-2 py-0.5 rounded-full ${
                                  app.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' :
                                  app.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                  'bg-rose-100 text-rose-700'
                                }`}>
                                  {app.status}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Internships */}
                      {searchResults.internships.length > 0 && (
                        <div>
                          <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Internships</div>
                          {searchResults.internships.map((internship) => (
                            <button
                              key={internship.id}
                              onClick={() => handleResultClick('internship', internship.id)}
                              className="w-full px-3 py-2 text-left hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-3"
                            >
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">{internship.title}</div>
                                <div className="text-xs text-gray-500 truncate line-clamp-1">{internship.description}</div>
                                <div className={`text-xs mt-1 inline-block px-2 py-0.5 rounded-full ${
                                  internship.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                  internship.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                  'bg-rose-100 text-rose-700'
                                }`}>
                                  {internship.status}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-gray-500 text-sm">No results found</div>
                  )}
                </div>
              )}
            </div>

            {/* Profile block: avatar, name, role, caret with dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu((v) => !v)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/60 transition-colors"
                aria-label="Open profile menu"
              >
                {pictureUrl ? (
                  <div className="relative">
                    <img
                      src={pictureUrl}
                      alt="Profile"
                      className="w-10 h-10 rounded-full object-cover border-2 border-blue-200 shadow-sm"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        const fallback = e.currentTarget.nextElementSibling
                        if (fallback) fallback.style.display = 'flex'
                      }}
                    />
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center border-2 border-blue-200 shadow-sm hidden">
                      <span className="text-lg font-bold text-white">
                        {displayName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center border-2 border-blue-200 shadow-sm">
                    <span className="text-lg font-bold text-white">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="hidden md:flex flex-col items-start">
                  <span className="text-sm font-semibold text-gray-900 leading-tight">{displayName}</span>
                  <span className="text-xs text-gray-600 leading-tight">{displayRole}</span>
                </div>
                <svg className="w-4 h-4 text-gray-500 hidden md:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-30">
                  <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                    <p className="text-sm font-semibold text-gray-900">{displayName}</p>
                    <p className="text-xs text-gray-600">{email}</p>
                  </div>
                  <button 
                    className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 transition-colors flex items-center gap-2" 
                    onClick={() => { setShowModal(true); setShowMenu(false) }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    View Profile
                  </button>
                  <button 
                    className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 transition-colors flex items-center gap-2" 
                    onClick={() => { setShowMenu(false); navigate('/university/settings') }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Settings
                  </button>
                  <div className="border-t border-gray-100">
                    <button 
                      className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2" 
                      onClick={() => { setShowMenu(false); signOut() }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <ProfilePictureModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        profilePicture={profile?.profile_picture}
        userName={displayName}
        userRole={profile?.role || ''}
      />
    </>
  )
}