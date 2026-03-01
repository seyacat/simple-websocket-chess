import { useConnectionStore } from '@/stores/connectionStore'

class WebSocketService {
  constructor() {
    this.ws = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = parseInt(import.meta.env.VITE_WS_MAX_RECONNECT_ATTEMPTS) || 5
    this.reconnectDelay = parseInt(import.meta.env.VITE_WS_RECONNECT_DELAY) || 3000
    this.reconnectTimer = null
    this.messageHandlers = new Map()
    
    this.connectionStore = useConnectionStore()
    
    // Registrar handlers por defecto
    this.registerDefaultHandlers()
  }

  registerDefaultHandlers() {
    // Handler para mensajes de conexión establecida
    this.on('connection_established', (data) => {
      console.log('Conexión WebSocket establecida:', data)
      
      this.connectionStore.setUuid(data.uuid)
      this.connectionStore.setShortToken(data.shortToken)
      this.connectionStore.setConnected(true)
      this.connectionStore.clearError()
      
      this.reconnectAttempts = 0
      
      // Notificar a otros componentes
      this.emit('connected', data)
    })

    // Handler para mensajes de error
    this.on('error', (data) => {
      console.error('Error del servidor WebSocket:', data)
      this.connectionStore.setError(data.error || 'Error desconocido')
    })

    // Handler para mensajes normales (directos de guest a host)
    this.on('message', (data) => {
      console.log('Mensaje directo recibido:', data)
      // Este evento será manejado por el hostGameStore si estamos en modo host
      this.emit('direct_message', data)
    })

    // Handler para confirmación de envío
    this.on('message_sent', (data) => {
      console.log('Mensaje enviado confirmado:', data)
    })

    // Handler para confirmación de modo
    this.on('mode_set', (data) => {
      console.log('Modo establecido:', data)
      this.connectionStore.setMode(data.mode, data.visibility)
    })

    // Handler para lista de hosts públicos
    this.on('public_hosts_list', (data) => {
      console.log('Lista de hosts públicos recibida:', data)
      this.connectionStore.setPublicHosts(data.hosts || [])
      this.connectionStore.updateLastPublicHostsUpdate()
    })

    // Handler para confirmación de suscripción
    this.on('subscribed', (data) => {
      console.log('Suscripción exitosa:', data)
      this.connectionStore.setSubscribedHost(data.to)
    })

    // Handler para nuevo subscriber (solo para hosts)
    this.on('new_subscriber', (data) => {
      console.log('Nuevo subscriber:', data)
      this.connectionStore.addSubscriber(data.guest)
      // Emitir evento específico para hostGameStore
      this.emit('guest_subscribed', data)
    })

    // Handler para subscriber desconectado (solo para hosts)
    this.on('subscriber_disconnected', (data) => {
      console.log('Subscriber desconectado:', data)
      this.connectionStore.removeSubscriber(data.guest)
      // Emitir evento específico para hostGameStore
      this.emit('guest_disconnected', data)
    })

    // Handler para host desconectado (solo para guests)
    this.on('host_disconnected', (data) => {
      console.log('Host desconectado:', data)
      this.connectionStore.setSubscribedHost(null)
      // Emitir evento específico para playerGameStore
      this.emit('host_lost', data)
    })

    // Handler para mensajes broadcast (del host a todos)
    this.on('broadcast_message', (data) => {
      console.log('Mensaje broadcast recibido:', data)
      // Emitir evento específico para playerGameStore (y hostGameStore si el host también es jugador)
      this.emit('game_broadcast', data)
    })
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket ya está conectado')
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      try {
        const url = this.buildWebSocketUrl()
        console.log('Conectando a WebSocket:', url)
        
        this.ws = new WebSocket(url)
        
        this.ws.onopen = () => {
          console.log('WebSocket conectado')
          this.connectionStore.setConnected(true)
          this.connectionStore.clearError()
          resolve()
        }
        
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            this.handleMessage(data)
          } catch (error) {
            console.error('Error parsing WebSocket message:', error, event.data)
          }
        }
        
        this.ws.onclose = (event) => {
          console.log('WebSocket desconectado:', event.code, event.reason)
          this.connectionStore.setConnected(false)
          this.handleDisconnection(event)
        }
        
        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          this.connectionStore.setError('Error de conexión WebSocket')
          reject(error)
        }
        
      } catch (error) {
        console.error('Error al crear WebSocket:', error)
        this.connectionStore.setError('No se pudo crear la conexión WebSocket')
        reject(error)
      }
    })
  }

  buildWebSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = import.meta.env.VITE_WS_SERVER_HOST || 'closer.click'
    const port = import.meta.env.VITE_WS_SERVER_PORT || '4000'
    const uuid = this.connectionStore.uuid
    
    let url = `${protocol}//${host}:${port}/ws`
    if (uuid) {
      url += `?uuid=${uuid}`
    }
    
    return url
  }

  handleDisconnection(event) {
    // Intentar reconectar si no fue un cierre intencional
    if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`Intentando reconectar (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
      
      this.reconnectTimer = setTimeout(() => {
        this.connect().catch(error => {
          console.error('Error reconectando:', error)
        })
      }, this.reconnectDelay)
    }
  }

  handleMessage(data) {
    const { type, ...rest } = data
    
    // Emitir evento global (los handlers se ejecutarán a través del sistema de eventos)
    this.emit(type, rest)
    
    // Para mensajes específicos del juego, emitir eventos adicionales
    if (type === 'broadcast_message') {
      // Parsear el mensaje broadcast para determinar el tipo de mensaje de juego
      const { message } = rest
      if (message && message.includes('|')) {
        const [msgType, jsonData] = message.split('|')
        try {
          const parsedData = JSON.parse(jsonData)
          // Emitir evento específico para el tipo de mensaje de juego
          this.emit(`game_${msgType.toLowerCase()}`, parsedData)
        } catch (error) {
          console.error('Error parseando mensaje de juego:', error)
        }
      }
    }
  }

  sendMessage(to, message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket no está conectado')
      return Promise.reject(new Error('WebSocket no está conectado'))
    }

    return new Promise((resolve, reject) => {
      try {
        const payload = {
          type: 'send_message',
          to,
          message: typeof message === 'string' ? message : JSON.stringify(message)
        }
        
        this.ws.send(JSON.stringify(payload))
        console.log('Mensaje enviado:', payload)
        resolve()
      } catch (error) {
        console.error('Error enviando mensaje:', error)
        reject(error)
      }
    })
  }

  sendGameMessage(to, type, data) {
    const message = `${type}|${JSON.stringify(data)}`
    return this.sendMessage(to, message)
  }

  // Métodos para nuevo protocolo de lobby
  setMode(mode, visibility = null) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket no está conectado')
      return Promise.reject(new Error('WebSocket no está conectado'))
    }

    return new Promise((resolve, reject) => {
      try {
        const payload = {
          type: 'set_mode',
          mode,
          ...(visibility && { visibility })
        }
        
        this.ws.send(JSON.stringify(payload))
        console.log('Modo establecido enviado:', payload)
        resolve()
      } catch (error) {
        console.error('Error estableciendo modo:', error)
        reject(error)
      }
    })
  }

  listPublicHosts() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket no está conectado')
      return Promise.reject(new Error('WebSocket no está conectado'))
    }

    return new Promise((resolve, reject) => {
      try {
        const payload = {
          type: 'list_public_hosts'
        }
        
        this.ws.send(JSON.stringify(payload))
        console.log('Solicitud de hosts públicos enviada')
        resolve()
      } catch (error) {
        console.error('Error solicitando hosts públicos:', error)
        reject(error)
      }
    })
  }

  subscribeToHost(hostToken) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket no está conectado')
      return Promise.reject(new Error('WebSocket no está conectado'))
    }

    return new Promise((resolve, reject) => {
      try {
        const payload = {
          type: 'subscribe',
          to: hostToken
        }
        
        this.ws.send(JSON.stringify(payload))
        console.log('Suscripción enviada:', payload)
        resolve()
      } catch (error) {
        console.error('Error suscribiéndose a host:', error)
        reject(error)
      }
    })
  }

  unsubscribe() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket no está conectado')
      return Promise.reject(new Error('WebSocket no está conectado'))
    }

    return new Promise((resolve, reject) => {
      try {
        const payload = {
          type: 'unsubscribe'
        }
        
        this.ws.send(JSON.stringify(payload))
        console.log('Desuscripción enviada')
        resolve()
      } catch (error) {
        console.error('Error desuscribiéndose:', error)
        reject(error)
      }
    })
  }

  disconnect() {
    // Limpiar timer de reconexión
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    
    this.reconnectAttempts = 0
    
    if (this.ws) {
      this.ws.close(1000, 'Cierre intencional por usuario')
      this.ws = null
    }
    
    this.connectionStore.setConnected(false)
  }

  // Sistema de eventos
  on(event, handler) {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, [])
    }
    this.messageHandlers.get(event).push(handler)
  }

  off(event, handler) {
    if (this.messageHandlers.has(event)) {
      const handlers = this.messageHandlers.get(event)
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  emit(event, data) {
    // Los eventos se manejan a través del sistema de handlers
    const handlers = this.messageHandlers.get(event) || []
    handlers.forEach(handler => handler(data))
  }
}

// Singleton instance
let instance = null

export function getWebSocketService() {
  if (!instance) {
    instance = new WebSocketService()
  }
  return instance
}