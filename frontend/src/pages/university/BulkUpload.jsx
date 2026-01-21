import React, { useState } from 'react'
import Papa from 'papaparse'
import toast from 'react-hot-toast'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../context/AuthContext'
import Spinner from '../../components/Spinner'

export default function BulkUpload() {
  const { profile } = useAuth()
  const [file, setFile] = useState(null)
  const [rows, setRows] = useState([])
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const downloadTemplate = () => {
    const headers = ['name', 'email', 'student_id', 'batch', 'degree_program', 'semester']
    const exampleRow = ['John Doe', 'john.doe@example.com', 'STU001', '2022', 'BSE', '6']
    const csvContent = [headers, exampleRow].map(row => row.join(',')).join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', 'student_upload_template.csv')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Template downloaded!')
  }

  const parseCsv = (file) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          toast.error(`CSV parsing errors: ${results.errors.map(e => e.message).join(', ')}`)
        }
        setRows(results.data)
        toast.success(`Parsed ${results.data.length} rows`)
      },
      error: (err) => toast.error(err.message),
    })
  }

  const handleFile = (file) => {
    if (!file) return
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      return toast.error('Please upload a CSV file')
    }
    if (file.size > 5 * 1024 * 1024) {
      return toast.error('File size must be less than 5MB')
    }
    setFile(file)
    parseCsv(file)
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const uploadCsv = async () => {
    if (!file) return toast.error('Select a CSV file')
    if (rows.length === 0) return toast.error('No valid data to upload')
    
    try {
      setUploading(true)
      // Read CSV text locally and bypass Storage upload
      const csvText = await file.text()
      const inlinePath = `inline-upload/${profile.id}/${Date.now()}-${file.name}`

      // Create bulk upload record
      const { data: bulkUpload, error: bulkError } = await supabase
        .from('bulk_uploads')
        .insert({
          university_id: profile.id,
          file_name: file.name,
          file_path: inlinePath,
          status: 'processing',
          total_records: rows.length
        })
        .select()
        .single()

      if (bulkError) throw bulkError

      // Call backend API endpoint to process CSV
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) {
        throw new Error('Authentication required. Please log in again.')
      }

      // In development, always use relative path to leverage Vite proxy
      // In production, use VITE_BACKEND_URL if set
      const isDev = !import.meta.env.PROD
      const backendUrl = import.meta.env.VITE_BACKEND_URL || ''
      const apiUrl = isDev 
        ? '/api/university/bulk-upload-students' 
        : (backendUrl ? `${backendUrl}/api/university/bulk-upload-students` : '/api/university/bulk-upload-students')
      
      console.log('[BulkUpload] Sending request to:', apiUrl, isDev ? '(via Vite proxy)' : '(direct)')
      
      // Create AbortController for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 300000) // 5 minute timeout
      
      try {
        const resp = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ 
            csvText, 
            universityId: profile.id, 
            bulkUploadId: bulkUpload.id 
          }),
          signal: controller.signal,
        })
        
        clearTimeout(timeoutId)

        console.log('[BulkUpload] Response status:', resp.status, resp.statusText)

        if (!resp.ok) {
          const errorData = await resp.json().catch(() => ({ error: resp.statusText }))
          console.error('[BulkUpload] Error response:', errorData)
          throw new Error(errorData.error || `CSV processing failed: ${resp.status} ${resp.statusText}`)
        }

        const result = await resp.json()
        console.log('[BulkUpload] Success response:', result)
        
        // Handle response - check for success field or assume success if status is 200
        if (result.success !== false) {
          const successCount = result.results?.successful || result.successful || 0
          const failedCount = result.results?.failed || result.failed || 0
          const total = result.results?.total || result.total || rows.length
          
          if (failedCount > 0) {
            toast.success(`CSV processed: ${successCount} students created, ${failedCount} failed out of ${total} total.`)
          } else {
            toast.success(`CSV processed successfully: ${successCount} students created.`)
          }
        } else {
          throw new Error(result.error || 'CSV processing failed')
        }
      } catch (fetchError) {
        clearTimeout(timeoutId)
        if (fetchError.name === 'AbortError') {
          throw new Error('Request timeout: CSV processing took too long. Please check the backend logs.')
        }
        throw fetchError
      }
      
      // Reset form
      setFile(null)
      setRows([])
    } catch (e) {
      toast.error(e.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </span>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-blue-600">Bulk Upload Student Data</h1>
              <p className="text-xs md:text-sm text-gray-600 mt-1">
                Upload CSV file to add multiple students at once
              </p>
            </div>
          </div>
          <button
            onClick={downloadTemplate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition shadow-sm font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download Template
          </button>
        </div>
      </div>

      {/* Upload Area */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </span>
            <h2 className="text-lg font-semibold text-gray-900">Upload CSV File</h2>
          </div>
        </div>
        <div className="p-6">
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
              dragActive
                ? 'border-blue-500 bg-blue-50/50 shadow-lg scale-[1.02]'
                : 'border-gray-300 bg-gradient-to-br from-gray-50 to-blue-50/30 hover:border-blue-400 hover:bg-blue-50/50'
            }`}
          >
            <div className="flex flex-col items-center">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 transition-all ${
                dragActive 
                  ? 'bg-blue-100 scale-110' 
                  : 'bg-gradient-to-br from-blue-100 to-indigo-100'
              }`}>
                <svg className={`w-10 h-10 ${dragActive ? 'text-blue-600' : 'text-blue-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {dragActive ? 'Drop your CSV file here' : 'Upload a CSV file with student information'}
              </h3>
              <p className="text-sm text-gray-600 mb-6 max-w-md">
                Upload a CSV file with student information to get started.{' '}
                <button
                  onClick={downloadTemplate}
                  className="text-blue-600 hover:text-blue-700 underline font-medium"
                >
                  Download a template
                </button>{' '}
                to see the required format.
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => handleFile(e.target.files?.[0])}
                className="hidden"
                id="csv-upload"
              />
              <label
                htmlFor="csv-upload"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition shadow-sm font-medium cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Choose File
              </label>
              {file && (
                <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg inline-flex items-center gap-3">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-left">
                    <p className="text-sm font-medium text-emerald-900">File Selected</p>
                    <p className="text-xs text-emerald-700">
                      <span className="font-medium">{file.name}</span> ({(file.size / 1024).toFixed(2)} KB)
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      {rows.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-6 py-4 border-b border-gray-200">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Data Preview</h3>
                  <p className="text-xs text-gray-600 mt-0.5">{rows.length} {rows.length === 1 ? 'row' : 'rows'} ready to upload</p>
                </div>
              </div>
              <button
                onClick={uploadCsv}
                disabled={uploading}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg hover:from-emerald-700 hover:to-teal-700 transition shadow-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <>
                    <Spinner />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span>Upload & Process</span>
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="overflow-auto border border-gray-200 rounded-lg">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-50 to-blue-50">
                    {Object.keys(rows[0] || {}).map((k) => {
                      // Get icon for column header
                      const getColumnIcon = (columnName) => {
                        const col = columnName.toLowerCase()
                        if (col.includes('name')) {
                          return (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          )
                        }
                        if (col.includes('email')) {
                          return (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          )
                        }
                        if (col.includes('student_id') || col.includes('studentid')) {
                          return (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                            </svg>
                          )
                        }
                        if (col.includes('batch')) {
                          return (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          )
                        }
                        if (col.includes('program') || col.includes('degree')) {
                          return (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                          )
                        }
                        if (col.includes('semester')) {
                          return (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          )
                        }
                        return (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        )
                      }
                      return (
                        <th key={k} className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-600">{getColumnIcon(k)}</span>
                            <span>{k.replace(/_/g, ' ')}</span>
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {rows.slice(0, 20).map((r, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      {Object.entries(r).map(([key, value], i) => {
                        // Get icon for cell based on column type
                        const getCellIcon = (columnName, cellValue) => {
                          const col = columnName.toLowerCase()
                          if (col.includes('name')) {
                            return (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 text-blue-600 flex-shrink-0">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                              </span>
                            )
                          }
                          if (col.includes('email')) {
                            return (
                              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                            )
                          }
                          if (col.includes('student_id') || col.includes('studentid')) {
                            return (
                              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                              </svg>
                            )
                          }
                          if (col.includes('batch')) {
                            return (
                              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            )
                          }
                          if (col.includes('program') || col.includes('degree')) {
                            return (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 flex-shrink-0">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                </svg>
                              </span>
                            )
                          }
                          if (col.includes('semester')) {
                            return (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-50 text-amber-600 flex-shrink-0">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </span>
                            )
                          }
                          return null
                        }
                        const cellValue = String(value || '-')
                        const hasIcon = getCellIcon(key, cellValue) !== null
                        return (
                          <td key={i} className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              {getCellIcon(key, cellValue)}
                              <span className={`text-gray-700 ${key.toLowerCase().includes('student_id') || key.toLowerCase().includes('studentid') ? 'font-mono text-sm' : ''}`}>
                                {cellValue}
                              </span>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 20 && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-800 text-center">
                  <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Showing first 20 rows of <span className="font-semibold">{rows.length}</span> total rows.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}