import React, { useEffect, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../utils/supabase'
import toast from 'react-hot-toast'
import CVPreview from './CVPreview'

const schema = z.object({
  personal: z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email address'),
    phone: z.string().min(7, 'Phone must be at least 7 digits'),
    address: z.string().optional(),
    date_of_birth: z.string().optional(),
  }),
  education: z.array(z.object({
    institution: z.string().min(1, 'Institution is required'),
    degree: z.string().min(1, 'Degree is required'),
    year: z.string().min(1, 'Year is required'),
    gpa: z.string().optional(),
  })).min(1, 'At least one education entry is required'),
  skills: z.array(z.string()).min(1, 'At least one skill is required'),
  experience: z.array(z.object({
    company: z.string().min(1, 'Company is required'),
    role: z.string().min(1, 'Role is required'),
    duration: z.string().min(1, 'Duration is required'),
    description: z.string().optional(),
  })).optional(),
  projects: z.array(z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    technologies: z.array(z.string()).optional(),
    link: z.string().url().optional().or(z.literal('')),
  })).optional(),
  certifications: z.array(z.object({
    name: z.string().min(1, 'Name is required'),
    issuer: z.string().optional(),
    date: z.string().optional(),
  })).optional(),
  languages: z.array(z.object({
    language: z.string().min(1, 'Language is required'),
    proficiency: z.string().optional(),
  })).optional(),
})

export default function CVForm() {
  const { profile } = useAuth()
  const [showPreview, setShowPreview] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  
  const { register, handleSubmit, control, setValue, watch, formState: { errors, isValid } } = useForm({
    resolver: zodResolver(schema),
    mode: 'onChange', // Real-time validation
    defaultValues: {
      personal: { name: '', email: '', phone: '', address: '', date_of_birth: '' },
      education: [{ institution: '', degree: '', year: '', gpa: '' }],
      skills: [],
      experience: [],
      projects: [],
      certifications: [],
      languages: [],
    },
  })

  const { fields: educationFields, append: appendEducation, remove: removeEducation } = useFieldArray({
    control,
    name: 'education'
  })

  const { fields: experienceFields, append: appendExperience, remove: removeExperience } = useFieldArray({
    control,
    name: 'experience'
  })

  const { fields: projectFields, append: appendProject, remove: removeProject } = useFieldArray({
    control,
    name: 'projects'
  })

  const { fields: certFields, append: appendCert, remove: removeCert } = useFieldArray({
    control,
    name: 'certifications'
  })

  const { fields: languageFields, append: appendLanguage, remove: removeLanguage } = useFieldArray({
    control,
    name: 'languages'
  })

  const skillsInput = watch('skillsInput', '')
  const skills = watch('skills', [])

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('cv_forms').select('*').eq('user_id', profile.id).maybeSingle()
      if (data) {
        setValue('personal', data.personal || {})
        setValue('education', data.education || [])
        setValue('skills', data.skills || [])
        setValue('experience', data.experience || [])
        setValue('projects', data.projects || [])
        setValue('certifications', data.certifications || [])
        setValue('languages', data.languages || [])
      }
    }
    if (profile?.id) load()
  }, [profile?.id, setValue])

  const handleSkillsChange = (e) => {
    const value = e.target.value
    setValue('skillsInput', value)
    const skillsArray = value.split(',').map(s => s.trim()).filter(Boolean)
    setValue('skills', skillsArray)
  }

  const onSubmit = async (form) => {
    setIsSaving(true)
    const isComplete = Boolean(
      form.personal?.name &&
      form.personal?.email &&
      form.personal?.phone &&
      (form.education?.length || 0) > 0 &&
      (form.skills?.length || 0) > 0
    )
    
    const payload = {
      user_id: profile.id,
      personal: form.personal,
      education: form.education,
      skills: form.skills,
      experience: form.experience || [],
      projects: form.projects || [],
      certifications: form.certifications || [],
      languages: form.languages || [],
      is_complete: isComplete,
    }
    
    const { error } = await supabase.from('cv_forms').upsert(payload, { onConflict: 'user_id' })
    setIsSaving(false)
    if (error) return toast.error(error.message)
    toast.success('CV saved successfully!')
  }

  if (showPreview) {
    return <CVPreview userId={profile.id} onClose={() => setShowPreview(false)} />
  }

  return (
    <div className="space-y-6">
      {/* Header aligned with dashboard style (colored panel) */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h4m1 4H7a2 2 0 01-2-2V6a2 2 0 012-2h5.586a2 2 0 011.414.586l3.414 3.414A2 2 0 0118 8.414V18a2 2 0 01-2 2z"
                />
              </svg>
            </span>
            <div>
              <h2 className="text-2xl font-bold text-blue-600">CV Builder</h2>
              <p className="text-sm text-gray-600 mt-1">
                Create and maintain your CV. This will be shared with software houses when you apply.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="inline-flex items-center gap-2 px-4 py-2 border border-blue-200 rounded-lg text-blue-700 bg-white hover:bg-blue-50 transition text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618V15.5a1 1 0 01-.553.894L15 18m0-8v8m0-8L9 6m0 0L4.447 3.724A1 1 0 003 4.618V11.5a1 1 0 00.553.894L9 14m0-8v8"
                />
              </svg>
              Preview CV
            </button>
            <button
              type="button"
              onClick={handleSubmit(onSubmit)}
              disabled={isSaving || !isValid}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    ></path>
                  </svg>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Save CV
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Personal Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Personal Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
              <input
                {...register('personal.name')}
                placeholder="Your full name"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {errors.personal?.name && (
                <p className="mt-1 text-sm text-red-600">{errors.personal.name.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
              <input
                {...register('personal.email')}
                type="email"
                placeholder="your.email@example.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {errors.personal?.email && (
                <p className="mt-1 text-sm text-red-600">{errors.personal.email.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Phone *</label>
              <input
                {...register('personal.phone')}
                type="tel"
                placeholder="+92 300 1234567"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {errors.personal?.phone && (
                <p className="mt-1 text-sm text-red-600">{errors.personal.phone.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
              <input
                {...register('personal.address')}
                placeholder="Your address"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth</label>
              <input
                {...register('personal.date_of_birth')}
                type="date"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Education */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Education *</h3>
            <button
              type="button"
              onClick={() => appendEducation({ institution: '', degree: '', year: '', gpa: '' })}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              + Add Education
            </button>
          </div>
          <div className="space-y-4">
            {educationFields.map((field, index) => (
              <div key={field.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-gray-700">Education #{index + 1}</span>
                  {educationFields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeEducation(index)}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Institution *</label>
                    <input
                      {...register(`education.${index}.institution`)}
                      placeholder="University name"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {errors.education?.[index]?.institution && (
                      <p className="mt-1 text-sm text-red-600">{errors.education[index].institution.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Degree *</label>
                    <input
                      {...register(`education.${index}.degree`)}
                      placeholder="e.g., BSE, MS"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {errors.education?.[index]?.degree && (
                      <p className="mt-1 text-sm text-red-600">{errors.education[index].degree.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Year *</label>
                    <input
                      {...register(`education.${index}.year`)}
                      placeholder="e.g., 2022-2026"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {errors.education?.[index]?.year && (
                      <p className="mt-1 text-sm text-red-600">{errors.education[index].year.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">GPA</label>
                    <input
                      {...register(`education.${index}.gpa`)}
                      placeholder="e.g., 3.5"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {errors.education && (
            <p className="mt-2 text-sm text-red-600">{errors.education.message}</p>
          )}
        </div>

        {/* Skills */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Skills *</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Enter skills (comma-separated)
            </label>
            <input
              value={skillsInput}
              onChange={handleSkillsChange}
              placeholder="e.g., React, Node.js, Python, JavaScript"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {skills.map((skill, idx) => (
                  <span key={idx} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                    {skill}
                  </span>
                ))}
              </div>
            )}
            {errors.skills && (
              <p className="mt-2 text-sm text-red-600">{errors.skills.message}</p>
            )}
          </div>
        </div>

        {/* Experience */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Experience</h3>
            <button
              type="button"
              onClick={() => appendExperience({ company: '', role: '', duration: '', description: '' })}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              + Add Experience
            </button>
          </div>
          <div className="space-y-4">
            {experienceFields.map((field, index) => (
              <div key={field.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-gray-700">Experience #{index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeExperience(index)}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Company *</label>
                    <input
                      {...register(`experience.${index}.company`)}
                      placeholder="Company name"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Role *</label>
                    <input
                      {...register(`experience.${index}.role`)}
                      placeholder="Your position"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Duration *</label>
                    <input
                      {...register(`experience.${index}.duration`)}
                      placeholder="e.g., 6 months"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                    <textarea
                      {...register(`experience.${index}.description`)}
                      placeholder="Describe your responsibilities"
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Projects */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Projects</h3>
            <button
              type="button"
              onClick={() => appendProject({ title: '', description: '', technologies: [], link: '' })}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              + Add Project
            </button>
          </div>
          <div className="space-y-4">
            {projectFields.map((field, index) => (
              <div key={field.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-gray-700">Project #{index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeProject(index)}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
                    <input
                      {...register(`projects.${index}.title`)}
                      placeholder="Project title"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                    <textarea
                      {...register(`projects.${index}.description`)}
                      placeholder="Project description"
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Technologies (comma-separated)</label>
                    <input
                      {...register(`projects.${index}.technologiesInput`)}
                      placeholder="React, Node.js, MongoDB"
                      onChange={(e) => {
                        const techs = e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                        setValue(`projects.${index}.technologies`, techs)
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Project Link</label>
                    <input
                      {...register(`projects.${index}.link`)}
                      type="url"
                      placeholder="https://project-link.com"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Certifications */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Certifications</h3>
            <button
              type="button"
              onClick={() => appendCert({ name: '', issuer: '', date: '' })}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              + Add Certification
            </button>
          </div>
          <div className="space-y-4">
            {certFields.map((field, index) => (
              <div key={field.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-gray-700">Certification #{index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeCert(index)}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                    <input
                      {...register(`certifications.${index}.name`)}
                      placeholder="Certification name"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Issuer</label>
                    <input
                      {...register(`certifications.${index}.issuer`)}
                      placeholder="Issuing organization"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
        <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                    <input
                      {...register(`certifications.${index}.date`)}
                      type="date"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Languages */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Languages</h3>
            <button
              type="button"
              onClick={() => appendLanguage({ language: '', proficiency: '' })}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              + Add Language
            </button>
          </div>
          <div className="space-y-4">
            {languageFields.map((field, index) => (
              <div key={field.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-gray-700">Language #{index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeLanguage(index)}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Language *</label>
                    <input
                      {...register(`languages.${index}.language`)}
                      placeholder="e.g., English, Urdu"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
        </div>
        <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Proficiency</label>
                    <select
                      {...register(`languages.${index}.proficiency`)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select proficiency</option>
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                      <option value="native">Native</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
          >
            Preview CV
          </button>
          <button
            type="submit"
            disabled={isSaving || !isValid}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save CV'}
          </button>
        </div>
      </form>
    </div>
  )
}