import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import logo from '../logos/logo.jpeg'

export default function Landing() {
  const [visibleSections, setVisibleSections] = useState(new Set())

  useEffect(() => {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.getAttribute('data-animate')
          if (sectionId) {
            setVisibleSections((prev) => new Set([...prev, sectionId]))
          }
        }
      })
    }, observerOptions)

    const sections = document.querySelectorAll('[data-animate]')
    sections.forEach((section) => observer.observe(section))

    return () => {
      sections.forEach((section) => observer.unobserve(section))
    }
  }, [])

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-gradient-to-r from-white via-blue-50 to-white backdrop-blur shadow-sm border-blue-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3 transform hover:scale-105 transition-transform duration-300">
              <img src={logo} alt="AIILP logo" className="w-12 h-12 rounded-xl object-cover shadow ring-1 ring-blue-200" />
              <div>
                <div className="text-xl font-bold text-slate-900 leading-tight tracking-tight">AIILP</div>
                <div className="text-xs text-slate-600">Internship & Industry Linkage Platform</div>
              </div>
            </div>
            <nav className="hidden md:flex items-center gap-6 text-sm text-slate-700">
              <a href="#features" className="hover:text-blue-700 transition-colors duration-300 relative group">
                Features
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-700 group-hover:w-full transition-all duration-300"></span>
              </a>
              <a href="#how-it-works" className="hover:text-blue-700 transition-colors duration-300 relative group">
                How it works
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-700 group-hover:w-full transition-all duration-300"></span>
              </a>
              <a href="#success" className="hover:text-blue-700 transition-colors duration-300 relative group">
                Success
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-700 group-hover:w-full transition-all duration-300"></span>
              </a>
            </nav>
            <div className="flex items-center gap-3">
              <Link to="/login" className="px-4 py-2 text-blue-700 font-medium hover:text-blue-800 hover:scale-105 transition-all duration-300">
                Login
              </Link>
              <Link to="/signup" className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 hover:scale-105 transition-all duration-300">
                Register
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section (Card Style) */}
      <section className="py-12 bg-white" data-animate="hero">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={`w-full bg-gradient-to-br from-blue-400 to-blue-600 text-white rounded-2xl shadow-xl p-8 sm:p-10 transition-all duration-1000 ${
            visibleSections.has('hero') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white text-center">
              Connecting Universities, Students, and Industry for Smarter Internships
            </h1>
            <p className="mt-4 sm:mt-6 text-sm sm:text-base md:text-lg text-blue-100 text-center max-w-3xl mx-auto">
              Streamline your internship process with our centralized management system.
              Access role-based dashboards, seamless communication, and find the perfect match.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Link to="/signup" className="px-6 sm:px-8 py-2.5 sm:py-3 bg-white text-blue-700 rounded-lg font-semibold shadow hover:bg-gray-100 hover:scale-105 transition-all duration-300">
                Register Now
              </Link>
              <Link to="/login" className="px-6 sm:px-8 py-2.5 sm:py-3 bg-blue-500/90 text-white rounded-lg font-semibold shadow hover:bg-blue-500 hover:scale-105 transition-all duration-300">
                Login
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Why AIILP Section */}
      <section id="features" className="py-20 bg-white" data-animate="features">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={`transition-all duration-1000 ${
            visibleSections.has('features') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}>
            <h2 className="text-4xl font-bold text-gray-900 text-center mb-4">Why AIILP?</h2>
            <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
              A professional, end‑to‑end platform connecting academia and industry with clear workflows
              and deep analytics—designed for students, universities, and companies.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: (
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7l9-4 9 4-9 4-9-4zm0 6l9 4 9-4" />
                  </svg>
                ),
                title: 'Role‑Based Dashboards',
                description: 'Tailored views and actions for students, universities, and software houses.',
                bgColor: 'bg-blue-50',
                delay: 0
              },
              {
                icon: (
                  <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                ),
                title: 'Centralized Workflow',
                description: 'Manage CVs, listings, applications, and approvals in one place.',
                bgColor: 'bg-indigo-50',
                delay: 100
              },
              {
                icon: (
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.4-1.4a2 2 0 00-.6-1.4V11a6 6 0 10-12 0v3.3c0 .5-.2 1-.6 1.4L4 17h5" />
                  </svg>
                ),
                title: 'Smart Notifications',
                description: 'Timely updates on application status, deadlines, and approvals.',
                bgColor: 'bg-purple-50',
                delay: 200
              },
              {
                icon: (
                  <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3v18M4 13v8m14-14v14m-7-8v8" />
                  </svg>
                ),
                title: 'Analytics & Insights',
                description: 'Track placements, engagement, and performance with actionable metrics.',
                bgColor: 'bg-teal-50',
                delay: 300
              }
            ].map((feature, index) => (
              <div
                key={index}
                className={`bg-gray-50 p-6 rounded-lg shadow-sm hover:shadow-lg hover:scale-105 transition-all duration-500 ${
                  visibleSections.has('features') 
                    ? 'opacity-100 translate-y-0' 
                    : 'opacity-0 translate-y-8'
                }`}
                style={{ transitionDelay: `${feature.delay}ms` }}
              >
                <div className={`w-12 h-12 rounded-xl ${feature.bgColor} flex items-center justify-center mb-4 transform hover:rotate-6 transition-transform duration-300`}>
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 bg-gradient-to-br from-gray-50 to-white" data-animate="how-it-works">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={`text-center mb-12 transition-all duration-1000 ${
            visibleSections.has('how-it-works') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}>
            <h2 className="text-4xl font-bold text-gray-900">How It Works</h2>
            <p className="text-gray-600 mt-3 max-w-2xl mx-auto">
              Four simple steps to go from student profile to successful placement—
              streamlined for students, universities, and industry partners.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              {
                number: '1',
                numberBg: 'bg-blue-600',
                iconBg: 'bg-blue-50',
                icon: (
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A6 6 0 1118.88 6.196M15 21v-2a4 4 0 00-8 0v2" />
                  </svg>
                ),
                title: 'Create Your Profile',
                description: 'Build a standout profile with your CV, skills, and preferences.',
                delay: 0
              },
              {
                number: '2',
                numberBg: 'bg-indigo-600',
                iconBg: 'bg-indigo-50',
                icon: (
                  <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10 18a8 8 0 100-16 8 8 0 000 16z" />
                  </svg>
                ),
                title: 'Browse Internships',
                description: 'Discover curated listings from universities and software houses.',
                delay: 150
              },
              {
                number: '3',
                numberBg: 'bg-purple-600',
                iconBg: 'bg-purple-50',
                icon: (
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9-7-9-7-9 7 9 7zm0 0v5" />
                  </svg>
                ),
                title: 'Apply & Track',
                description: 'Submit applications and monitor status with smart notifications.',
                delay: 300
              },
              {
                number: '4',
                numberBg: 'bg-teal-600',
                iconBg: 'bg-teal-50',
                icon: (
                  <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 20h12M9 12l3 3 5-5M7 4h10v4H7z" />
                  </svg>
                ),
                title: 'Collaborate & Get Hired',
                description: 'Coordinate with mentors and recruiters; turn internships into offers.',
                delay: 450
              }
            ].map((step, index) => (
              <div
                key={index}
                className={`relative bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-lg hover:scale-105 transition-all duration-500 ${
                  visibleSections.has('how-it-works')
                    ? 'opacity-100 translate-x-0'
                    : 'opacity-0 -translate-x-8'
                }`}
                style={{ transitionDelay: `${step.delay}ms` }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${step.numberBg} text-white text-sm font-semibold animate-bounce`} style={{ animationDelay: `${step.delay}ms`, animationDuration: '2s' }}>
                    {step.number}
                  </span>
                  <div className={`w-10 h-10 rounded-lg ${step.iconBg} flex items-center justify-center transform hover:rotate-12 transition-transform duration-300`}>
                    {step.icon}
                  </div>
                </div>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="text-gray-600 mt-2">{step.description}</p>
              </div>
            ))}
          </div>

          <div className={`mt-10 flex justify-center gap-4 transition-all duration-1000 ${
            visibleSections.has('how-it-works') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`} style={{ transitionDelay: '600ms' }}>
            <Link to="/signup" className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 hover:scale-105 transition-all duration-300">Start Now</Link>
            <Link to="/login" className="px-6 py-3 bg-white border border-gray-200 text-gray-800 rounded-lg font-semibold hover:border-gray-300 hover:scale-105 transition-all duration-300">Login</Link>
          </div>
        </div>
      </section>

      {/* Success Stories Section */}
      <section id="success" className="py-20 bg-gray-50" data-animate="success">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={`transition-all duration-1000 ${
            visibleSections.has('success') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}>
            <h2 className="text-4xl font-bold text-gray-900 text-center mb-4">Success Stories</h2>
            <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
              Real outcomes from students, universities, and industry partners using AIILP.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: (
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0v6m-4 0h8" />
                  </svg>
                ),
                title: 'Student Placement',
                subtitle: 'Hired after internship',
                quote: '"AIILP matched me with a role that fit my skills. The process was smooth and transparent."',
                bgColor: 'bg-blue-50',
                delay: 0
              },
              {
                icon: (
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7l9-4 9 4-9 4-9-4zm0 0v10a2 2 0 002 2h14a2 2 0 002-2V7" />
                  </svg>
                ),
                title: 'University Outcomes',
                subtitle: 'Higher placement rate',
                quote: '"Our placement tracking and coordination improved dramatically with centralized workflows."',
                bgColor: 'bg-green-50',
                delay: 200
              },
              {
                icon: (
                  <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 10l5-5 5 5M7 14h10v6H7z" />
                  </svg>
                ),
                title: 'Industry Partners',
                subtitle: 'Faster hiring cycles',
                quote: '"We found exceptional talent quickly. AIILP made screening and communication effortless."',
                bgColor: 'bg-amber-50',
                delay: 400
              }
            ].map((story, index) => (
              <div
                key={index}
                className={`bg-white p-6 rounded-lg shadow-sm hover:shadow-lg hover:scale-105 transition-all duration-500 ${
                  visibleSections.has('success')
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-8'
                }`}
                style={{ transitionDelay: `${story.delay}ms` }}
              >
                <div className="flex items-center justify-center mb-4">
                  <div className={`w-12 h-12 rounded-xl ${story.bgColor} flex items-center justify-center transform hover:scale-110 transition-transform duration-300`}>
                    {story.icon}
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-center mb-1">{story.title}</h3>
                <p className="text-sm text-gray-500 text-center mb-4">{story.subtitle}</p>
                <p className="text-gray-600 italic text-center">{story.quote}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gradient-to-r from-slate-50 via-blue-50/40 to-slate-50 py-14 border-t border-blue-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <img src={logo} alt="AIILP logo" className="w-10 h-10 rounded-lg object-cover shadow-sm ring-1 ring-blue-200" />
                <span className="text-xl font-bold text-slate-900">AIILP</span>
              </div>
              <p className="text-slate-600">Connecting talent with opportunity.</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-800 tracking-wide uppercase mb-4">Quick Links</h4>
              <ul className="space-y-2 text-slate-600">
                <li><Link to="/login" className="hover:text-blue-700 hover:underline">Login</Link></li>
                <li><Link to="/signup" className="hover:text-blue-700 hover:underline">Register</Link></li>
                <li><a href="#features" className="hover:text-blue-700 hover:underline">Features</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-800 tracking-wide uppercase mb-4">Legal</h4>
              <ul className="space-y-2 text-slate-600">
                <li><Link to="#" className="hover:text-blue-700 hover:underline">Terms of Service</Link></li>
                <li><Link to="#" className="hover:text-blue-700 hover:underline">Privacy Policy</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-800 tracking-wide uppercase mb-4">Follow Us</h4>
              <div className="flex items-center gap-3">
                <a href="https://twitter.com/" target="_blank" rel="noopener noreferrer" aria-label="Twitter" className="p-2 rounded-lg bg-white/90 text-slate-600 border border-blue-100 shadow-sm hover:bg-blue-50 hover:text-blue-700 transition">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23 3a10.9 10.9 0 01-3.14 1.53A4.48 4.48 0 0016.11 2c-2.5 0-4.51 2.16-3.92 4.6A12.94 12.94 0 013 3.1s-4 9 5 13a13.38 13.38 0 01-8 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/></svg>
                </a>
                <a href="https://facebook.com/" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="p-2 rounded-lg bg-white/90 text-slate-600 border border-blue-100 shadow-sm hover:bg-blue-50 hover:text-blue-700 transition">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M22 12a10 10 0 10-11.5 9.95v-7.04H8.35V12h2.15V9.8c0-2.12 1.27-3.29 3.2-3.29.93 0 1.9.17 1.9.17v2.08h-1.07c-1.06 0-1.39.66-1.39 1.34V12h2.37l-.38 2.91h-1.99v7.04A10 10 0 0022 12z"/></svg>
                </a>
                <a href="https://linkedin.com/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="p-2 rounded-lg bg-white/90 text-slate-600 border border-blue-100 shadow-sm hover:bg-blue-50 hover:text-blue-700 transition">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.5 8.5H4.5v14H.5v-14zM8.5 8.5h3.8v1.9h.05c.53-1 1.84-2.05 3.8-2.05 4.06 0 4.8 2.67 4.8 6.15v8h-4v-7.1c0-1.7-.03-3.9-2.38-3.9-2.39 0-2.75 1.86-2.75 3.78V22.5h-4v-14z"/></svg>
                </a>
                <a href="https://instagram.com/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="p-2 rounded-lg bg-white/90 text-slate-600 border border-pink-100 shadow-sm hover:bg-pink-50 hover:text-pink-700 transition">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 2C4.243 2 2 4.243 2 7v10c0 2.757 2.243 5 5 5h10c2.757 0 5-2.243 5-5V7c0-2.757-2.243-5-5-5H7zm10 2a3 3 0 013 3v10a3 3 0 01-3 3H7a3 3 0 01-3-3V7a3 3 0 013-3h10zm-5 3a5 5 0 100 10 5 5 0 000-10zm6.5-.75a1.25 1.25 0 11-2.5 0 1.25 1.25 0 012.5 0z"/></svg>
                </a>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-blue-100 text-center">
            <p className="text-slate-600">© 2025 AIILP. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

