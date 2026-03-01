import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getWebSocketProxyClient } from '@/services/WebSocketProxyClient'

export const useConnectionStore = defineStore('connection', () => {
  // Estado de conexión WebSocketProxyClient
  const wsProxyClient = getWebSocketProxyClient()
  const token = ref(null) // Token asignado por el proxy (4 caracteres)
  const isConnected = ref(false)
  const connectionError = ref(null)
  const wsUrl = ref(import.meta.env.VITE_WS_URL || 'ws://localhost:4001')
  
  // Estado para protocolo de lobby con proxy
  const mode = ref(null) // null, 'host', 'guest'
  const visibility = ref(null) // null, 'public', 'private' (solo para hosts)
  const publicHosts = ref([]) // Lista de tokens de hosts públicos
  const subscribedHost = ref(null) // token del host suscrito (para guests)
  const subscribers = ref([]) // lista de tokens de guests (para hosts)
  const lastPublicHostsUpdate = ref(null)
  
  // Mapeo de localId a token para comunicación transparente
  const localIdToTokenMap = ref(new Map())
  
  // Getters
  const connectionStatus = computed(() => {
    if (connectionError.value) return 'error'
    if (isConnected.value) return 'connected'
    return 'disconnected'
  })

  const hasToken = computed(() => !!token.value)
  const canPlay = computed(() => isConnected.value && subscribedHost.value)
  
  // Nuevos getters para protocolo de lobby
  const isHost = computed(() => mode.value === 'host')
  const isGuest = computed(() => mode.value === 'guest')
  const isPublicHost = computed(() => isHost.value && visibility.value === 'public')
  const hasSubscribers = computed(() => subscribers.value.length > 0)
  const subscribersCount = computed(() => subscribers.value.length)
  const isSubscribed = computed(() => !!subscribedHost.value)

  // Acciones básicas
  const setToken = (newToken) => {
    token.value = newToken
  }

  const setConnected = (connected) => {
    isConnected.value = connected
    if (!connected) {
      connectionError.value = null
      token.value = null
    }
  }

  const setError = (error) => {
    connectionError.value = error
    isConnected.value = false
  }

  const clearError = () => {
    connectionError.value = null
  }

  const reset = () => {
    token.value = null
    isConnected.value = false
    connectionError.value = null
    
    // Resetear estado de lobby
    mode.value = null
    visibility.value = null
    publicHosts.value = []
    subscribedHost.value = null
    subscribers.value = []
    lastPublicHostsUpdate.value = null
    localIdToTokenMap.value.clear()
    
    // Limpiar localStorage de datos antiguos (no compatibilidad)
    localStorage.removeItem('chess_uuid')
    localStorage.removeItem('chess_short_token')
    localStorage.removeItem('chess_opponent_token')
    localStorage.removeItem('chess_mode')
    localStorage.removeItem('chess_visibility')
    localStorage.removeItem('chess_subscribed_host')
  }

  // Nuevas acciones para protocolo de lobby con proxy
  const setMode = (newMode, newVisibility = null) => {
    mode.value = newMode
    visibility.value = newVisibility
    
    // Resetear estado relacionado al cambiar modo
    if (newMode === 'host') {
      subscribedHost.value = null
      subscribers.value = []
      // Host se publica en canal 'chess_hosts' si es público
      if (newVisibility === 'public' && token.value) {
        publishToChessHosts()
      }
    } else if (newMode === 'guest') {
      subscribers.value = []
    }
  }

  const setPublicHosts = (hosts) => {
    publicHosts.value = hosts || []
  }

  const setSubscribedHost = (hostToken) => {
    subscribedHost.value = hostToken
  }

  const addSubscriber = (guestToken) => {
    if (!subscribers.value.includes(guestToken)) {
      subscribers.value.push(guestToken)
    }
  }

  const removeSubscriber = (guestToken) => {
    const index = subscribers.value.indexOf(guestToken)
    if (index > -1) {
      subscribers.value.splice(index, 1)
    }
  }

  const clearSubscribers = () => {
    subscribers.value = []
  }

  const updateLastPublicHostsUpdate = () => {
    lastPublicHostsUpdate.value = Date.now()
  }

  // Acciones específicas del proxy WebSocket
  const connect = async () => {
    try {
      // Configurar URL del proxy
      const options = {
        url: wsUrl.value,
        autoReconnect: true,
        maxReconnectAttempts: parseInt(import.meta.env.VITE_WS_MAX_RECONNECT_ATTEMPTS) || 5,
        reconnectDelay: parseInt(import.meta.env.VITE_WS_RECONNECT_DELAY) || 3000
      }
      
      // Configurar handlers de eventos del proxy
      setupProxyEventHandlers()
      
      // Conectar al proxy
      await wsProxyClient.connect()
      
      return true
    } catch (error) {
      console.error('Error conectando al proxy WebSocket:', error)
      setError('Error de conexión: ' + (error.message || 'Desconocido'))
      return false
    }
  }

  const disconnect = () => {
    wsProxyClient.disconnect()
    setConnected(false)
    token.value = null
  }

  const publishToChessHosts = async () => {
    if (!isConnected.value || !token.value) {
      console.error('No conectado o sin token para publicar en canal')
      return false
    }
    
    try {
      await wsProxyClient.publish('chess_hosts')
      console.log('Host publicado en canal chess_hosts')
      return true
    } catch (error) {
      console.error('Error publicando en canal chess_hosts:', error)
      return false
    }
  }

  const listPublicHosts = async () => {
    if (!isConnected.value) {
      console.error('No conectado para listar hosts públicos')
      return []
    }
    
    try {
      const hosts = await wsProxyClient.listChannel('chess_hosts')
      // Los hosts son tokens (4 caracteres) en el canal
      setPublicHosts(hosts)
      updateLastPublicHostsUpdate()
      return hosts
    } catch (error) {
      console.error('Error listando hosts públicos:', error)
      return []
    }
  }

  const subscribeToHost = async (hostToken) => {
    if (!isConnected.value || !token.value) {
      console.error('No conectado o sin token para suscribirse a host')
      return false
    }
    
    if (hostToken === token.value) {
      console.error('No puedes suscribirte a ti mismo')
      return false
    }
    
    try {
      // Iniciar handshake con el host
      const messageId = await wsProxyClient.initiateHandshake(hostToken, 30000)
      console.log(`Handshake iniciado con host ${hostToken}, messageId: ${messageId}`)
      
      // El evento 'paired' se manejará en setupProxyEventHandlers
      return true
    } catch (error) {
      console.error('Error suscribiéndose a host:', error)
      setError('Error suscribiéndose: ' + (error.message || 'Desconocido'))
      return false
    }
  }

  const unsubscribe = async () => {
    if (!isConnected.value || !subscribedHost.value) {
      return false
    }
    
    try {
      await wsProxyClient.disconnectFrom(subscribedHost.value)
      subscribedHost.value = null
      return true
    } catch (error) {
      console.error('Error desuscribiéndose:', error)
      return false
    }
  }

  const sendMessage = async (toToken, message) => {
    if (!isConnected.value || !token.value) {
      console.error('No conectado o sin token para enviar mensaje')
      return false
    }
    
    try {
      await wsProxyClient.send(toToken, message)
      return true
    } catch (error) {
      console.error('Error enviando mensaje:', error)
      return false
    }
  }

  const broadcastToSubscribers = async (message) => {
    if (!isConnected.value || !token.value || subscribers.value.length === 0) {
      return false
    }
    
    try {
      // Enviar mensaje a cada subscriber individualmente
      for (const subscriberToken of subscribers.value) {
        await wsProxyClient.send(subscriberToken, message)
      }
      return true
    } catch (error) {
      console.error('Error enviando broadcast:', error)
      return false
    }
  }

  // Configurar handlers de eventos del proxy
  const setupProxyEventHandlers = () => {
    // Limpiar handlers anteriores si existen
    // Nota: WebSocketProxyClient no tiene método off para todos los handlers
    // Se asume que se llama una vez durante la inicialización
    
    // Token asignado al conectar
    wsProxyClient.on('token_assigned', (assignedToken) => {
      console.log('Token asignado por proxy:', assignedToken)
      token.value = assignedToken
    })
    
    // Conexión establecida
    wsProxyClient.on('connect', () => {
      console.log('Conectado al proxy WebSocket')
      setConnected(true)
      clearError()
    })
    
    // Desconexión
    wsProxyClient.on('disconnect', (data) => {
      console.log('Desconectado del proxy:', data)
      setConnected(false)
      token.value = null
      
      if (data.code !== 1000) {
        setError(`Desconexión inesperada: ${data.reason || 'Código ' + data.code}`)
      }
    })
    
    // Error de conexión
    wsProxyClient.on('error', (errorData) => {
      console.error('Error del proxy:', errorData)
      setError(`Error WebSocket: ${errorData.error || 'Desconocido'}`)
    })
    
    // Mensaje recibido
    wsProxyClient.on('message', (fromToken, message, timestamp, parsedMessage) => {
      console.log(`Mensaje recibido de ${fromToken}:`, message)
      // Los mensajes específicos del juego serán manejados por los stores de juego
      // Este store solo maneja mensajes de control del lobby
    })
    
    // Handshake request (para hosts)
    wsProxyClient.on('handshake_request', (data) => {
      console.log('Solicitud de handshake recibida:', data)
      
      if (isHost.value) {
        // Auto-aceptar handshake de guests
        wsProxyClient.respondToHandshake(data, 'handshake_accepted')
        console.log('Handshake aceptado automáticamente para guest:', data.from)
      }
    })
    
    // Paired (handshake completado)
    wsProxyClient.on('paired', (pairedToken) => {
      console.log('Conectado con:', pairedToken)
      
      if (isGuest.value && !subscribedHost.value) {
        // Guest: handshake completado con host
        setSubscribedHost(pairedToken)
      } else if (isHost.value) {
        // Host: nuevo guest conectado
        addSubscriber(pairedToken)
      }
    })
    
    // Unpaired (desconexión)
    wsProxyClient.on('unpaired', (unpairedToken, timestamp) => {
      console.log('Desconectado de:', unpairedToken)
      
      if (isGuest.value && subscribedHost.value === unpairedToken) {
        // Guest: host desconectado
        setSubscribedHost(null)
        setError('Host desconectado')
      } else if (isHost.value) {
        // Host: guest desconectado
        removeSubscriber(unpairedToken)
      }
    })
    
    // Channel updated (lista de hosts públicos)
    wsProxyClient.on('channel_updated', (channel, tokens, count, timestamp) => {
      if (channel === 'chess_hosts') {
        console.log(`Canal chess_hosts actualizado: ${count} hosts`)
        setPublicHosts(tokens)
        updateLastPublicHostsUpdate()
      }
    })
  }

  // Inicializar cargando estado mínimo (solo modo/visibilidad si existen)
  const loadSavedState = () => {
    const savedMode = localStorage.getItem('chess_mode')
    const savedVisibility = localStorage.getItem('chess_visibility')
    
    if (savedMode) mode.value = savedMode
    if (savedVisibility) visibility.value = savedVisibility
  }

  // Inicializar
  loadSavedState()

  return {
    // Estado
    token,
    isConnected,
    connectionError,
    wsUrl,
    
    // Nuevo estado para protocolo de lobby
    mode,
    visibility,
    publicHosts,
    subscribedHost,
    subscribers,
    lastPublicHostsUpdate,
    
    // Getters
    connectionStatus,
    hasToken,
    canPlay,
    
    // Nuevos getters para protocolo de lobby
    isHost,
    isGuest,
    isPublicHost,
    hasSubscribers,
    subscribersCount,
    isSubscribed,
    
    // Acciones básicas
    setToken,
    setConnected,
    setError,
    clearError,
    reset,
    loadSavedState,
    
    // Acciones de conexión proxy
    connect,
    disconnect,
    
    // Acciones de lobby con proxy
    setMode,
    setPublicHosts,
    setSubscribedHost,
    addSubscriber,
    removeSubscriber,
    clearSubscribers,
    updateLastPublicHostsUpdate,
    publishToChessHosts,
    listPublicHosts,
    subscribeToHost,
    unsubscribe,
    
    // Acciones de mensajería
    sendMessage,
    broadcastToSubscribers,
    
    // Referencia al cliente proxy (para uso avanzado)
    wsProxyClient: () => wsProxyClient
  }
})