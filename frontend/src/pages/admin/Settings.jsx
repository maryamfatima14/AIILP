import React, { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { uploadProfilePicture, getProfilePictureUrl } from '../../utils/api'
import { logProfilePictureUpload } from '../../utils/logging'
import { supabase } from '../../utils/supabase'
import toast from 'react-hot-toast'

export default function Settings() {
  const { user, profile, updateProfile } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(null)
  const fileInputRef = useRef(null)

  // Account info
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [orgName, setOrgName] = useState(profile?.organization_name || '')
  const [savingInfo, setSavingInfo] = useState(false)

  // Security
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const pictureUrl = profile?.profile_picture
    ? getProfilePictureUrl(profile.profile_picture)
    : null
  const initial = user?.email?.[0]?.toUpperCase() || 'A'

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please select a valid image file (JPEG, PNG, or WebP)')
      return
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB')
      return
    }

    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreview(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      toast.error('Please select a file first')
      return
    }

    if (!user?.id) {
      toast.error('Not authenticated')
      return
    }

    setUploading(true)
    try {
      const result = await uploadProfilePicture(file, user.id)

      if (result.success) {
        // Update profile in context
        await updateProfile({ profile_picture: result.filePath })
        
        // Log the action
        if (user?.id) {
          logProfilePictureUpload(user.id).catch((err) =>
            console.error('[Settings] Failed to log upload:', err),
          )
        }
        
        toast.success('Profile picture uploaded successfully!')
        setPreview(null)
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      } else {
        toast.error(result.error || 'Upload failed')
      }
    } catch (error) {
      console.error('Upload error:', error)
      toast.error('Failed to upload profile picture')
    } finally {
      setUploading(false)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  // Initialize state from profile
  useEffect(() => {
    if (!profile) return
    setFullName(profile?.full_name || '')
    setOrgName(profile?.organization_name || '')
  }, [profile])

  const handleSaveInfo = async () => {
    if (!user?.id) return toast.error('Not authenticated')
    setSavingInfo(true)
    try {
      const { error } = await updateProfile({ full_name: fullName || null, organization_name: orgName || null })
      if (error) throw error
      toast.success('Account info saved')
    } catch (err) {
      console.error('[AdminSettings] save info error', err)
      toast.error(err.message || 'Failed to save')
    } finally {
      setSavingInfo(false)
    }
  }

  const changePassword = async () => {
    if (!newPassword || newPassword.length < 8) return toast.error('Password must be at least 8 characters')
    if (newPassword !== confirmPassword) return toast.error('Passwords do not match')
    setChangingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      toast.success('Password updated')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      console.error('[AdminSettings] change password error', err)
      toast.error(err.message || 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()

    const file = e.dataTransfer.files?.[0]
    if (file && fileInputRef.current) {
      fileInputRef.current.files = e.dataTransfer.files
      handleFileSelect({ target: { files: e.dataTransfer.files } })
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-blue-600">Settings</h1>
            <p className="text-sm text-gray-600 mt-1">Manage profile, preferences, and security.</p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-indigo-100 rounded-lg p-1">
            <span className="px-3 py-1.5 rounded-md text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200">Admin</span>
          </div>
        </div>
      </div>

      {/* Profile Picture Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Profile Picture</h2>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Current/Preview Picture */}
          <div className="flex-shrink-0">
            <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-gray-200 shadow-lg">
              {preview ? (
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              ) : pictureUrl ? (
                <img
                  src={pictureUrl}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <span className="text-4xl font-bold text-white">{initial}</span>
                </div>
              )}
            </div>
          </div>

          {/* Upload Section */}
          <div className="flex-1 space-y-4">
            <div
              className="border-2 border-dashed border-indigo-200 rounded-lg p-6 hover:border-indigo-500 transition-colors cursor-pointer"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="text-center">
                <svg
                  className="w-12 h-12 text-gray-400 mx-auto mb-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-sm text-gray-600 mb-1">
                  <span className="text-blue-600 font-medium">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-gray-500">
                  PNG, JPG, WEBP up to 5MB
                </p>
              </div>
            </div>

            {preview && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                    </svg>
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                      />
                    </svg>
                    <span>Upload Picture</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Account Information */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Account Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-indigo-700 mb-2">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Enter your full name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-indigo-700 mb-2">Organization Name</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Enter organization name"
            />
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={handleSaveInfo}
            disabled={savingInfo}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingInfo ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Security */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Security</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-indigo-700 mb-2">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Enter new password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-indigo-700 mb-2">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Re-enter new password"
            />
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={changePassword}
            disabled={changingPassword}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {changingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </div>
    </div>
  )
}

