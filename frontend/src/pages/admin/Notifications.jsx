import React, { useState, useMemo } from 'react'
import { useNotifications } from '../../hooks/useNotifications'
import { formatRelativeTime, getNotificationIcon, formatNotificationMessage } from '../../utils/notifications'
import Spinner from '../../components/Spinner'
import Modal from '../../components/Modal'
import toast from 'react-hot-toast'

export default function AdminNotifications() {
  const [activeTab, setActiveTab] = useState('all')
  const { notifications, isLoading, markAsRead, markAllAsRead, deleteNotification, deleteAllNotifications } = useNotifications()
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Filter notifications by tab (admin only sees user_approval and internship_approval)
  const filteredNotifications = useMemo(() => {
    if (!notifications) return []
    
    // Admin should only see:
    // 1. user_approval notifications
    // 2. internship_approval notifications with status = 'pending' (only pending internships need approval)
    const adminNotifications = notifications.filter(n => {
      if (n.type === 'user_approval') return true
      if (n.type === 'internship_approval') {
        // Only show pending internship approvals to admin
        return n.metadata?.status === 'pending'
      }
      return false
    })
    
    switch (activeTab) {
      case 'user_approval':
        return adminNotifications.filter(n => n.type === 'user_approval')
      case 'internship_approval':
        return adminNotifications.filter(n => 
          n.type === 'internship_approval' && n.metadata?.status === 'pending'
        )
      default:
        return adminNotifications
    }
  }, [notifications, activeTab])

  const unreadCount = useMemo(() => {
    return filteredNotifications.filter(n => !n.is_read).length
  }, [filteredNotifications])

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead()
      toast.success('All notifications marked as read')
    } catch (error) {
      toast.error('Failed to mark all as read')
    }
  }

  const handleMarkAsRead = async (notificationId) => {
    try {
      await markAsRead(notificationId)
    } catch (error) {
      toast.error('Failed to mark as read')
    }
  }

  const handleDeleteClick = async (notification) => {
    try {
      await deleteNotification(notification.id)
      toast.success('Notification deleted successfully')
    } catch (error) {
      toast.error('Failed to delete notification')
    }
  }

  const handleDeleteAllClick = () => {
    setShowDeleteAllConfirm(true)
  }

  const handleConfirmDeleteAll = async () => {
    try {
      setDeleting(true)
      await deleteAllNotifications()
      toast.success('All notifications deleted successfully')
      setShowDeleteAllConfirm(false)
    } catch (error) {
      toast.error('Failed to delete all notifications')
    } finally {
      setDeleting(false)
    }
  }

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-blue-600">Notifications</h1>
            <p className="text-sm text-gray-600 mt-1">
              {filteredNotifications.length} notification{filteredNotifications.length !== 1 ? 's' : ''} 
              {unreadCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                  {unreadCount} unread
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {filteredNotifications.length > 0 && (
              <button
                onClick={handleDeleteAllClick}
                className="px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-lg hover:from-red-700 hover:to-rose-700 transition shadow-sm font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete All
              </button>
            )}
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition shadow-sm font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Mark All as Read
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-gray-50 to-gray-100/50 border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab('all')}
              className={`flex-1 px-6 py-4 text-sm font-semibold transition-all duration-200 relative ${
                activeTab === 'all'
                  ? 'text-indigo-600 bg-white shadow-sm'
                  : 'text-gray-600 hover:text-indigo-600 hover:bg-white/50'
              }`}
            >
              All
              {activeTab === 'all' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-blue-500"></span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('user_approval')}
              className={`flex-1 px-6 py-4 text-sm font-semibold transition-all duration-200 relative ${
                activeTab === 'user_approval'
                  ? 'text-indigo-600 bg-white shadow-sm'
                  : 'text-gray-600 hover:text-indigo-600 hover:bg-white/50'
              }`}
            >
              User Approval
              {activeTab === 'user_approval' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-blue-500"></span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('internship_approval')}
              className={`flex-1 px-6 py-4 text-sm font-semibold transition-all duration-200 relative ${
                activeTab === 'internship_approval'
                  ? 'text-indigo-600 bg-white shadow-sm'
                  : 'text-gray-600 hover:text-indigo-600 hover:bg-white/50'
              }`}
            >
              Post Internship Approval
              {activeTab === 'internship_approval' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-blue-500"></span>
              )}
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="divide-y divide-gray-100">
          {filteredNotifications.length === 0 ? (
            <div className="p-16 text-center">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 mb-6">
                <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">No Notifications</h3>
              <p className="text-gray-500 max-w-sm mx-auto">
                {activeTab === 'all' 
                  ? "You're all caught up! No new notifications at the moment."
                  : `No ${activeTab === 'user_approval' ? 'user approval' : 'internship approval'} notifications.`}
              </p>
            </div>
          ) : (
            filteredNotifications.map((notification, index) => (
              <div
                key={notification.id}
                className={`group relative p-6 hover:bg-gradient-to-r hover:from-indigo-50/50 hover:to-blue-50/50 transition-all duration-200 ${
                  !notification.is_read 
                    ? 'bg-gradient-to-r from-indigo-50/30 to-blue-50/30 border-l-4 border-indigo-500' 
                    : 'bg-white'
                }`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {!notification.is_read && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500 to-blue-500"></div>
                )}
                <div className="flex items-start gap-5">
                  {/* Icon */}
                  <div className={`flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center shadow-md transform transition-transform group-hover:scale-110 ${
                    notification.type === 'user_approval'
                      ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white'
                      : notification.type === 'internship_approval'
                      ? 'bg-gradient-to-br from-blue-400 to-indigo-600 text-white'
                      : 'bg-gradient-to-br from-gray-400 to-gray-600 text-white'
                  }`}>
                    <div className="w-7 h-7">
                      {getNotificationIcon(notification.type)}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className={`text-lg font-bold ${
                            !notification.is_read ? 'text-gray-900' : 'text-gray-700'
                          }`}>
                            {notification.title}
                          </h3>
                          {!notification.is_read && (
                            <span className="flex-shrink-0 w-2.5 h-2.5 bg-indigo-500 rounded-full animate-pulse shadow-lg shadow-indigo-500/50"></span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-3 leading-relaxed">
                          {formatNotificationMessage(notification)}
                        </p>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {formatRelativeTime(notification.created_at)}
                          </span>
                          {notification.metadata?.status && (
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                              notification.metadata.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                : notification.metadata.status === 'pending'
                                ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                : 'bg-rose-100 text-rose-700 border border-rose-200'
                            }`}>
                              {notification.metadata.status.charAt(0).toUpperCase() + notification.metadata.status.slice(1)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {!notification.is_read && (
                          <button
                            onClick={() => handleMarkAsRead(notification.id)}
                            className="px-4 py-2 text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-all duration-200 border border-indigo-200 hover:border-indigo-300 hover:shadow-sm"
                          >
                            Mark as Read
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteClick(notification)}
                          className="px-3 py-2 text-xs font-semibold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-all duration-200 border border-red-200 hover:border-red-300 hover:shadow-sm"
                          title="Delete notification"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Delete All Notifications Confirmation Modal */}
      <Modal
        isOpen={showDeleteAllConfirm}
        onClose={() => setShowDeleteAllConfirm(false)}
        title="Delete All Notifications"
        size="small"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-700 mb-2">
                Are you sure you want to <strong className="text-red-600">delete all</strong> notifications? This action cannot be undone and will remove all {filteredNotifications.length} notification{filteredNotifications.length !== 1 ? 's' : ''}.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={() => setShowDeleteAllConfirm(false)}
              disabled={deleting}
              className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDeleteAll}
              disabled={deleting}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-red-600 to-rose-600 text-white font-semibold hover:from-red-700 hover:to-rose-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Deleting...
                </span>
              ) : (
                'Delete All'
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

