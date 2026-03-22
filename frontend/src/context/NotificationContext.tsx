import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import { NotificationToast } from '../components/NotificationToast'
import type { NotificationType } from '../components/NotificationToast'

interface Notification {
  id: string
  message: string
  type: NotificationType
}

interface NotificationContextType {
  showNotification: (message: string, type?: NotificationType) => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const lastNotificationRef = useRef<{ message: string; timestamp: number } | null>(null)

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const showNotification = useCallback((message: string, type: NotificationType = 'info') => {
    const now = Date.now()
    
    // Deduplication: prevent the exact same message from flooding within 500ms
    if (
      lastNotificationRef.current && 
      lastNotificationRef.current.message === message && 
      now - lastNotificationRef.current.timestamp < 500
    ) {
      return
    }
    
    lastNotificationRef.current = { message, timestamp: now }
    const id = `${now}-${Math.random().toString(36).substring(2, 9)}`
    
    setNotifications(prev => {
      const next = [...prev, { id, message, type }]
      return next.slice(-3)
    })
  }, [])

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-3 pointer-events-none w-full items-center px-4">
        {notifications.map(n => (
          <NotificationToast 
            key={n.id} 
            id={n.id} 
            message={n.message} 
            type={n.type} 
            onClose={removeNotification} 
          />
        ))}
      </div>
    </NotificationContext.Provider>
  )
}

export const useNotification = () => {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider')
  }
  return context
}
