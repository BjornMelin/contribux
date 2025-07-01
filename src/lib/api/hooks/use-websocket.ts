/**
 * WebSocket Hook for Real-time Features
 * Optimized real-time data synchronization with automatic reconnection
 *
 * Features:
 * - Automatic connection management and reconnection
 * - Message queuing during disconnection
 * - Type-safe event handling
 * - Integration with TanStack Query for cache updates
 * - Connection status monitoring
 * - Heartbeat/ping-pong for connection health
 */

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { queryKeys } from '../query-client'

type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface WebSocketMessage {
  type: string
  payload: any
  timestamp: number
  id?: string
}

interface WebSocketOptions {
  url?: string
  protocols?: string[]
  reconnectAttempts?: number
  reconnectInterval?: number
  heartbeatInterval?: number
  messageQueueSize?: number
}

interface UseWebSocketReturn {
  status: WebSocketStatus
  lastMessage: WebSocketMessage | null
  sendMessage: (message: WebSocketMessage) => void
  connect: () => void
  disconnect: () => void
  isConnected: boolean
}

const DEFAULT_OPTIONS: Required<WebSocketOptions> = {
  url: '',
  protocols: [],
  reconnectAttempts: 5,
  reconnectInterval: 3000, // 3 seconds
  heartbeatInterval: 30000, // 30 seconds
  messageQueueSize: 100,
}

export function useWebSocket(options: WebSocketOptions = {}): UseWebSocketReturn {
  const config = { ...DEFAULT_OPTIONS, ...options }
  const queryClient = useQueryClient()

  const [status, setStatus] = useState<WebSocketStatus>('disconnected')
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const messageQueueRef = useRef<WebSocketMessage[]>([])

  // Handle incoming messages and update cache
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data)
        setLastMessage(message)

        // Handle different message types
        switch (message.type) {
          case 'repository_updated':
            // Invalidate repository queries
            queryClient.invalidateQueries({ queryKey: queryKeys.repositories() })
            break

          case 'opportunity_updated':
            // Invalidate opportunity queries
            queryClient.invalidateQueries({ queryKey: queryKeys.opportunities() })
            break

          case 'opportunity_status_changed':
            // Update specific opportunity in cache
            if (message.payload.opportunityId) {
              queryClient.invalidateQueries({
                queryKey: queryKeys.opportunitiesDetail(message.payload.opportunityId),
              })
            }
            break

          case 'new_opportunity':
            // Add new opportunity to cache
            queryClient.invalidateQueries({ queryKey: queryKeys.opportunities() })
            break

          case 'repository_starred':
          case 'repository_forked':
            // Update repository metrics
            if (message.payload.owner && message.payload.repo) {
              queryClient.invalidateQueries({
                queryKey: queryKeys.repositoriesDetail(message.payload.owner, message.payload.repo),
              })
            }
            break

          case 'user_notification':
            // Handle user notifications
            console.log('Notification:', message.payload)
            break

          case 'heartbeat':
            // Respond to heartbeat
            sendMessage({ type: 'heartbeat_response', payload: {}, timestamp: Date.now() })
            break

          default:
            console.log('Unknown WebSocket message type:', message.type)
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    },
    [queryClient]
  )

  // Send message function with queuing
  const sendMessage = useCallback(
    (message: WebSocketMessage) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify(message))
        } catch (error) {
          console.error('Failed to send WebSocket message:', error)
        }
      } else {
        // Queue message for when connection is restored
        messageQueueRef.current.push(message)

        // Limit queue size
        if (messageQueueRef.current.length > config.messageQueueSize) {
          messageQueueRef.current.shift()
        }
      }
    },
    [config.messageQueueSize]
  )

  // Process queued messages
  const processQueuedMessages = useCallback(() => {
    while (messageQueueRef.current.length > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
      const message = messageQueueRef.current.shift()
      if (message) {
        sendMessage(message)
      }
    }
  }, [sendMessage])

  // Setup heartbeat
  const setupHeartbeat = useCallback(() => {
    if (heartbeatTimeoutRef.current) {
      clearInterval(heartbeatTimeoutRef.current)
    }

    heartbeatTimeoutRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        sendMessage({
          type: 'heartbeat',
          payload: {},
          timestamp: Date.now(),
        })
      }
    }, config.heartbeatInterval)
  }, [config.heartbeatInterval, sendMessage])

  // Connect function
  const connect = useCallback(() => {
    if (!config.url) {
      console.warn('WebSocket URL not provided')
      return
    }

    if (
      wsRef.current?.readyState === WebSocket.CONNECTING ||
      wsRef.current?.readyState === WebSocket.OPEN
    ) {
      return
    }

    try {
      setStatus('connecting')
      wsRef.current = new WebSocket(config.url, config.protocols)

      wsRef.current.onopen = () => {
        setStatus('connected')
        reconnectAttemptsRef.current = 0
        processQueuedMessages()
        setupHeartbeat()

        console.log('WebSocket connected')
      }

      wsRef.current.onmessage = handleMessage

      wsRef.current.onclose = event => {
        setStatus('disconnected')

        if (heartbeatTimeoutRef.current) {
          clearInterval(heartbeatTimeoutRef.current)
        }

        console.log('WebSocket disconnected:', event.code, event.reason)

        // Attempt reconnection if not intentionally closed
        if (event.code !== 1000 && reconnectAttemptsRef.current < config.reconnectAttempts) {
          reconnectAttemptsRef.current++

          console.log(
            `Attempting to reconnect (${reconnectAttemptsRef.current}/${config.reconnectAttempts})...`
          )

          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, config.reconnectInterval * reconnectAttemptsRef.current) // Exponential backoff
        }
      }

      wsRef.current.onerror = error => {
        setStatus('error')
        console.error('WebSocket error:', error)
      }
    } catch (error) {
      setStatus('error')
      console.error('Failed to create WebSocket connection:', error)
    }
  }, [config, handleMessage, processQueuedMessages, setupHeartbeat])

  // Disconnect function
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    if (heartbeatTimeoutRef.current) {
      clearInterval(heartbeatTimeoutRef.current)
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Intentional disconnect')
      wsRef.current = null
    }

    setStatus('disconnected')
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    status,
    lastMessage,
    sendMessage,
    connect,
    disconnect,
    isConnected: status === 'connected',
  }
}

// Specific hooks for different real-time features

// Repository updates hook
export function useRepositoryUpdates(owner?: string, repo?: string) {
  const { lastMessage, isConnected, connect, disconnect } = useWebSocket({
    url: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws',
  })

  const [repositoryUpdate, setRepositoryUpdate] = useState<any>(null)

  useEffect(() => {
    if (!isConnected) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [isConnected, connect, disconnect])

  useEffect(() => {
    if (lastMessage?.type === 'repository_updated') {
      const { owner: updateOwner, repo: updateRepo } = lastMessage.payload

      // If specific repository is being watched, filter updates
      if (owner && repo) {
        if (updateOwner === owner && updateRepo === repo) {
          setRepositoryUpdate(lastMessage.payload)
        }
      } else {
        // Update all repository data
        setRepositoryUpdate(lastMessage.payload)
      }
    }
  }, [lastMessage, owner, repo])

  return {
    repositoryUpdate,
    isConnected,
  }
}

// Opportunity updates hook
export function useOpportunityUpdates(opportunityId?: string) {
  const { lastMessage, isConnected, connect, disconnect } = useWebSocket({
    url: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws',
  })

  const [opportunityUpdate, setOpportunityUpdate] = useState<any>(null)

  useEffect(() => {
    if (!isConnected) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [isConnected, connect, disconnect])

  useEffect(() => {
    if (
      lastMessage?.type === 'opportunity_updated' ||
      lastMessage?.type === 'opportunity_status_changed'
    ) {
      if (opportunityId) {
        if (lastMessage.payload.opportunityId === opportunityId) {
          setOpportunityUpdate(lastMessage.payload)
        }
      } else {
        setOpportunityUpdate(lastMessage.payload)
      }
    }
  }, [lastMessage, opportunityId])

  return {
    opportunityUpdate,
    isConnected,
  }
}

// User notifications hook
export function useUserNotifications() {
  const { lastMessage, isConnected, connect, disconnect, sendMessage } = useWebSocket({
    url: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws',
  })

  const [notifications, setNotifications] = useState<any[]>([])

  useEffect(() => {
    if (!isConnected) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [isConnected, connect, disconnect])

  useEffect(() => {
    if (lastMessage?.type === 'user_notification') {
      setNotifications(prev => [lastMessage.payload, ...prev].slice(0, 50)) // Keep last 50
    }
  }, [lastMessage])

  const markAsRead = useCallback(
    (notificationId: string) => {
      sendMessage({
        type: 'mark_notification_read',
        payload: { notificationId },
        timestamp: Date.now(),
      })

      setNotifications(prev => prev.map(n => (n.id === notificationId ? { ...n, read: true } : n)))
    },
    [sendMessage]
  )

  return {
    notifications,
    markAsRead,
    isConnected,
  }
}

export default useWebSocket
