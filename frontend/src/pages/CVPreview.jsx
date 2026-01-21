import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../utils/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilePictureUrl } from '../utils/api'
import Spinner from '../components/Spinner'
import toast from 'react-hot-toast'

async function fetchCV(userId) {
  const { data, error } = await supabase
    .from('cv_forms')
    .select('*')
    .eq('user_id', userId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

async function fetchUserProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('profile_picture, full_name, email')
    .eq('id', userId)
    .single()
  if (error && error.code !== 'PGRST116') return null
  return data
}

export default function CVPreview({ userId, onClose }) {
  const { profile } = useAuth()
  const targetUserId = userId || profile?.id

  const { data: cv, isLoading } = useQuery({
    queryKey: ['cv', targetUserId],
    queryFn: () => fetchCV(targetUserId),
    enabled: !!targetUserId
  })

  const { data: userProfile } = useQuery({
    queryKey: ['profile', targetUserId],
    queryFn: () => fetchUserProfile(targetUserId),
    enabled: !!targetUserId
  })

  if (isLoading) return <Spinner />

  if (!cv) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-4xl mx-auto">
        <div className="text-center">
          <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">CV Not Found</h3>
          <p className="text-gray-600">This user hasn't created a CV yet.</p>
          {onClose && (
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              Close
            </button>
          )}
        </div>
      </div>
    )
  }

  const personal = cv.personal || {}
  const education = cv.education || []
  const experience = cv.experience || []
  const projects = cv.projects || []
  const certifications = cv.certifications || []
  const languages = cv.languages || []
  const skills = cv.skills || []

  const profilePictureUrl = userProfile?.profile_picture 
    ? getProfilePictureUrl(userProfile.profile_picture) 
    : null
  const initial = personal.name?.[0]?.toUpperCase() || userProfile?.full_name?.[0]?.toUpperCase() || 'U'

  return (
    <>
      {/* Print Styles */}
      <style>{`
        @media print {
          @page {
            margin: 0.5in;
          }
          body {
            background: white;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:p-6 {
            padding: 1.5rem !important;
          }
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          .print\\:rounded-none {
            border-radius: 0 !important;
          }
        }
      `}</style>
      
      <div className="bg-gray-50 min-h-screen py-8 print:py-0">
        <div className="max-w-4xl mx-auto px-4">
        {/* Action Buttons - Hidden on Print */}
        <div className="mb-6 print:hidden flex justify-between items-center">
          {onClose && (
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Form
            </button>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print / Save as PDF
            </button>
          </div>
        </div>

        {/* CV Document */}
        <div className="bg-white shadow-2xl rounded-lg overflow-hidden print:shadow-none print:rounded-none">
          {/* Professional Header with Profile Picture */}
          <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-700 text-white p-8 print:p-6">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
              {/* Profile Picture */}
              <div className="flex-shrink-0">
                {profilePictureUrl ? (
                  <div className="relative">
                    <img
                      src={profilePictureUrl}
                      alt={personal.name || 'Profile'}
                      className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-xl"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        const fallback = e.currentTarget.nextElementSibling
                        if (fallback) fallback.style.display = 'flex'
                      }}
                    />
                    <div className="w-32 h-32 rounded-full bg-white/20 backdrop-blur-sm border-4 border-white shadow-xl hidden items-center justify-center">
                      <span className="text-5xl font-bold text-white">{initial}</span>
                    </div>
                  </div>
                ) : (
                  <div className="w-32 h-32 rounded-full bg-white/20 backdrop-blur-sm border-4 border-white shadow-xl flex items-center justify-center">
                    <span className="text-5xl font-bold text-white">{initial}</span>
                  </div>
                )}
              </div>

              {/* Name and Contact Info */}
              <div className="flex-1 text-center md:text-left">
                <h1 className="text-4xl md:text-5xl font-bold mb-3 tracking-tight">
                  {personal.name || 'Your Name'}
                </h1>
                <div className="flex flex-wrap justify-center md:justify-start gap-4 text-blue-100 text-sm md:text-base">
                  {personal.email && (
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span>{personal.email}</span>
                    </div>
                  )}
                  {personal.phone && (
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span>{personal.phone}</span>
                    </div>
                  )}
                  {personal.address && (
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>{personal.address}</span>
                    </div>
                  )}
                  {personal.date_of_birth && (
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>{new Date(personal.date_of_birth).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* CV Content */}
          <div className="p-8 print:p-6 space-y-8">

            {/* Education */}
            {education.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1 h-8 bg-gradient-to-b from-blue-600 to-indigo-600 rounded"></div>
                  <h2 className="text-2xl font-bold text-gray-900 uppercase tracking-wide">Education</h2>
                  <div className="flex-1 h-0.5 bg-gradient-to-r from-blue-600 to-transparent"></div>
                </div>
                <div className="space-y-5">
                  {education.map((edu, idx) => (
                    <div key={idx} className="pl-6 border-l-4 border-blue-200 hover:border-blue-500 transition-colors">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-gray-900">{edu.degree || 'Degree'}</h3>
                          <p className="text-gray-700 font-medium">{edu.institution || 'Institution'}</p>
                        </div>
                        {edu.year && (
                          <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                            {edu.year}
                          </span>
                        )}
                      </div>
                      {edu.gpa && (
                        <p className="text-sm text-gray-600 mt-2">
                          <span className="font-semibold">GPA:</span> {edu.gpa}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Skills */}
            {skills.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1 h-8 bg-gradient-to-b from-green-600 to-emerald-600 rounded"></div>
                  <h2 className="text-2xl font-bold text-gray-900 uppercase tracking-wide">Skills</h2>
                  <div className="flex-1 h-0.5 bg-gradient-to-r from-green-600 to-transparent"></div>
                </div>
                <div className="flex flex-wrap gap-3">
                  {skills.map((skill, idx) => (
                    <span 
                      key={idx} 
                      className="px-4 py-2 bg-gradient-to-r from-green-50 to-emerald-50 text-green-800 rounded-lg text-sm font-semibold border border-green-200 shadow-sm"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Experience */}
            {experience.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1 h-8 bg-gradient-to-b from-purple-600 to-pink-600 rounded"></div>
                  <h2 className="text-2xl font-bold text-gray-900 uppercase tracking-wide">Experience</h2>
                  <div className="flex-1 h-0.5 bg-gradient-to-r from-purple-600 to-transparent"></div>
                </div>
                <div className="space-y-5">
                  {experience.map((exp, idx) => (
                    <div key={idx} className="pl-6 border-l-4 border-purple-200 hover:border-purple-500 transition-colors">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 mb-2">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-gray-900">{exp.role || 'Position'}</h3>
                          <p className="text-gray-700 font-medium">{exp.company || 'Company'}</p>
                        </div>
                        {exp.duration && (
                          <span className="text-sm font-semibold text-purple-600 bg-purple-50 px-3 py-1 rounded-full">
                            {exp.duration}
                          </span>
                        )}
                      </div>
                      {exp.description && (
                        <p className="text-gray-600 mt-2 leading-relaxed">{exp.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Projects */}
            {projects.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1 h-8 bg-gradient-to-b from-orange-600 to-amber-600 rounded"></div>
                  <h2 className="text-2xl font-bold text-gray-900 uppercase tracking-wide">Projects</h2>
                  <div className="flex-1 h-0.5 bg-gradient-to-r from-orange-600 to-transparent"></div>
                </div>
                <div className="space-y-5">
                  {projects.map((project, idx) => (
                    <div key={idx} className="pl-6 border-l-4 border-orange-200 hover:border-orange-500 transition-colors">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 mb-2">
                        <h3 className="text-lg font-bold text-gray-900">{project.title || 'Project Title'}</h3>
                        {project.link && (
                          <a 
                            href={project.link} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-orange-600 hover:text-orange-700 text-sm font-semibold flex items-center gap-1"
                          >
                            View Project
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        )}
                      </div>
                      {project.description && (
                        <p className="text-gray-600 mt-2 leading-relaxed">{project.description}</p>
                      )}
                      {project.technologies && project.technologies.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {project.technologies.map((tech, techIdx) => (
                            <span key={techIdx} className="px-3 py-1 bg-orange-50 text-orange-800 rounded-md text-xs font-medium border border-orange-200">
                              {tech}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Certifications */}
            {certifications.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1 h-8 bg-gradient-to-b from-yellow-600 to-amber-600 rounded"></div>
                  <h2 className="text-2xl font-bold text-gray-900 uppercase tracking-wide">Certifications</h2>
                  <div className="flex-1 h-0.5 bg-gradient-to-r from-yellow-600 to-transparent"></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {certifications.map((cert, idx) => (
                    <div key={idx} className="bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-yellow-500 to-amber-500 rounded-full flex items-center justify-center">
                          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-gray-900">{cert.name || 'Certification'}</p>
                          {cert.issuer && <p className="text-sm text-gray-700 mt-1">{cert.issuer}</p>}
                          {cert.date && (
                            <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {new Date(cert.date).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Languages */}
            {languages.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1 h-8 bg-gradient-to-b from-cyan-600 to-blue-600 rounded"></div>
                  <h2 className="text-2xl font-bold text-gray-900 uppercase tracking-wide">Languages</h2>
                  <div className="flex-1 h-0.5 bg-gradient-to-r from-cyan-600 to-transparent"></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {languages.map((lang, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-cyan-50 border border-cyan-200 rounded-lg p-3">
                      <span className="font-semibold text-gray-900 flex items-center gap-2">
                        <svg className="w-5 h-5 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                        </svg>
                        {lang.language || 'Language'}
                      </span>
                      <span className="text-sm font-semibold text-cyan-700 bg-cyan-100 px-3 py-1 rounded-full capitalize">
                        {lang.proficiency || 'Proficiency'}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
        </div>
      </div>
    </>
  )
}

