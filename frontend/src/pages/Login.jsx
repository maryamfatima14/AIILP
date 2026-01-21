import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../context/AuthContext'
import { useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../utils/supabase'

export default function Login() {
  const { register, handleSubmit, formState: { errors, isSubmitting, isValid } } = useForm({
    mode: 'onChange',
  })
  const { signIn, signOut } = useAuth()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState('student')

  const onSubmit = async ({ email, password }) => {
    try {
      console.log('[Login] Submit started', email, 'role:', role)
      const { data, error } = await signIn(email, password, role)
      if (error) {
        console.error('[Login] signIn returned error:', error)
        let message = error.message || 'Unable to login, please check your credentials'

        // If Supabase requires email confirmation, show approval-based messaging instead
        if (/email\s*not\s*confirmed/i.test(message)) {
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('approval_status')
              .eq('email', email)
              .maybeSingle()

            if (profile?.approval_status) {
              if (profile.approval_status === 'approved') {
                message = 'Please confirm your email to log in.'
              } else if (profile.approval_status === 'pending') {
                message = 'Confirm your email and wait for approval.'
              } else if (profile.approval_status === 'rejected') {
                message = 'Your account request was rejected. Please contact administrator.'
              }
            } else {
              // No profile record or missing field; default combined guidance
              message = 'Confirm your email and wait for approval.'
            }
          } catch (e) {
            console.warn('[Login] Fallback approval check failed:', e)
            message = 'Admin has not approved your account yet. Please wait for approval.'
          }
        }

        toast.error(message)
        return
      }
      console.log('[Login] signIn success. Data:', data)

      const roleRoutes = {
        student: '/dashboard/student',
        guest: '/dashboard/guest',
        university: '/dashboard/university',
        software_house: '/dashboard/software-house',
        admin: '/dashboard/admin',
      }

      const actualRole = data?.profile?.role || 'student'
      if (role !== actualRole) {
        const prettyRole = (actualRole || '').replace('_', ' ')
        toast.error(`Invalid role selected. Please choose "${prettyRole}" to log in.`)
        // Prevent navigation; sign out to avoid partial authenticated state on login page
        try { await signOut() } catch {}
        return
      }

      const target = roleRoutes[actualRole]
      if (!target) {
        toast.error('Your account role is not supported for login.')
        try { await signOut() } catch {}
        return
      }

      toast.success('Logged in successfully! Redirecting...')
      navigate(target, { replace: true })
    } catch (err) {
      console.error('Login error', err)
      toast.error('Unexpected error while logging in')
    }
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Left Side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h1>
            <p className="text-gray-600">Login to your account</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Role Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
              <select
                {...register('role', { required: 'Role is required' })}
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white"
              >
                <option value="student">Student</option>
                <option value="university">University</option>
                <option value="software_house">Software House</option>
                <option value="guest">Guest</option>
                <option value="admin">Admin</option>
              </select>
              {errors.role && <p className="mt-1 text-sm text-red-600">{errors.role.message}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address'
                  }
                })}
                type="email"
                placeholder="Enter your email"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <div className="relative">
                <input
                  {...register('password', {
                    required: 'Password is required',
                    minLength: {
                      value: 6,
                      message: 'Password must be at least 6 characters'
                    }
                  })}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
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
              {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>}
            </div>

            {/* Forgot Password */}
            <div className="flex justify-end">
              <Link to="#" className="text-sm text-blue-600 hover:text-blue-700">
                Forgot Password?
              </Link>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || !isValid}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Logging in...' : 'Login'}
            </button>
        </form>

          {/* Sign Up Link */}
          <p className="mt-6 text-center text-gray-600">
            Don't have an account?{' '}
            <Link to="/signup" className="text-blue-600 font-medium hover:text-blue-700">
              Sign Up
            </Link>
          </p>

          {/* Back to Home Link */}
          <div className="mt-4 text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors group"
            >
              <svg
                className="w-4 h-4 transition-transform group-hover:-translate-x-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to Home</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Right Side - Illustration */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-teal-400 to-teal-600 items-center justify-center p-8">
        <div className="text-center text-white">
          <div className="w-64 h-64 mx-auto mb-8 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
            <svg className="w-32 h-32 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-4">Connect with Opportunities</h2>
          <p className="text-teal-100">Join thousands of students and companies finding the perfect match</p>
        </div>
      </div>
    </div>
  )
}