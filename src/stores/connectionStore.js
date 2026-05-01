import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getWebSocketProxyClient } from '@gatoseya/closer-click-proxy-client'

export const useConnectionStore = defineStore('connection', () => {
  // Estado de conexión WebSocketProxyClient
  const wsProxyClient = getWebSocketProxyClient()
  const token = ref(null) // Token asignado por el proxy (4 caracteres)
  const isConnected = ref(false)
  const connectionError = ref(null)
  const wsUrl = ref(import.meta.env.VITE_WS_URL || 'wss://proxy.closer.click')
  
  // Estado para protocolo de lobby con proxy
  const mode = ref(null) // null, 'host', 'guest'
  const visibility = ref(null) // null, 'public', 'private' (solo para hosts)
  const publicHosts = ref([]) // Lista de tokens de hosts públicos
  const subscribedHost = ref(null) // token del host suscrito (para guests)
  const subscribers = ref([]) // lista de tokens de guests (para hosts)
  const lastPublicHostsUpdate = ref(null)
  
  // Mapeo de localId a token para comunicación transparente
  const localIdToTokenMap = ref(new Map())
  
  // Guard: evitar registrar listeners duplicados al reconectar
  let handlersSetup = false
  
  // Getters
  const connectionStatus = computed(() => {
    if (connectionError.value) return 'error'
    if (isConnected.value) return 'connected'
    return 'disconnected'
  })

  const hasToken = computed(() => !!token.value)
  const canPlay = computed(() => isConnected.value && subscribedHost.value)
  const shortToken = computed(() => token.value) // alias usado por componentes
  
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
    const oldMode = mode.value
    const oldVisibility = visibility.value
    
    // Despublicar si estábamos como host público
    if (oldMode === 'host' && oldVisibility === 'public' && newMode !== 'host') {
      unpublishFromChessHosts()
    }
    
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
      // Aplicar URL actual de la configuración (desde .env)
      wsProxyClient.updateConfig({ url: wsUrl.value })
      
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
      // Include additional data about the chess host
      const extraData = {
        gameType: 'chess',
        version: '1.0',
        timestamp: new Date().toISOString(),
        hostToken: token.value
      };
      
      await wsProxyClient.publish('chess_hosts', extraData)
      console.log('Host publicado en canal chess_hosts con datos adicionales')
      return true
    } catch (error) {
      console.error('Error publicando en canal chess_hosts:', error)
      return false
    }
  }

  const unpublishFromChessHosts = async () => {
    if (!isConnected.value || !token.value) {
      return false
    }
    
    try {
      if (wsProxyClient.unpublish) {
        await wsProxyClient.unpublish('chess_hosts')
        console.log('Host retirado del canal chess_hosts')
      }
      return true
    } catch (error) {
      console.error('Error retirando del canal chess_hosts:', error)
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
    
    // Setear el host directamente — el playerGameStore se encarga de
    // enviar REQUEST_FULL_STATE como primer mensaje
    setSubscribedHost(hostToken)
    
    console.log(`[Guest] Suscrito al host ${hostToken}. Solicitando estado completo...`)
    return true
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

  const broadcastToSubscribers = (message) => {
    if (!isConnected.value || !token.value || subscribers.value.length === 0) {
      return
    }
    
    // Enviar a todos los subscribers en paralelo (fire-and-forget)
    // message_sent es solo informativo, no bloqueamos esperando confirmación
    for (const subscriberToken of subscribers.value) {
      wsProxyClient.send(subscriberToken, message).catch(error => {
        console.error(`Error enviando a subscriber ${subscriberToken}:`, error)
      })
    }
  }

  // Configurar handlers de eventos del proxy (solo se ejecuta una vez)
  const setupProxyEventHandlers = () => {
    if (handlersSetup) return
    handlersSetup = true
    
    // Token asignado al conectar
    wsProxyClient.on('token', (assignedToken) => {
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
      // Los mensajes específicos del juego son manejados por los stores de juego
      // Este store no necesita loguear cada mensaje
    })
    
    // (channel_updated ya no se emite: list() devuelve los tokens directamente.
    //  El estado de publicHosts se mantiene vía joined/left/peer_disconnected.)

    // Notificación en tiempo real: alguien publicó en el canal
    wsProxyClient.on('channel_joined', (channel, joinedToken) => {
      if (channel !== 'chess_hosts') return
      if (joinedToken === token.value) return
      if (!publicHosts.value.includes(joinedToken)) {
        publicHosts.value = [...publicHosts.value, joinedToken]
        updateLastPublicHostsUpdate()
      }
    })

    // Notificación en tiempo real: alguien se despublicó del canal
    wsProxyClient.on('channel_left', (channel, leftToken) => {
      if (channel !== 'chess_hosts') return
      if (publicHosts.value.includes(leftToken)) {
        publicHosts.value = publicHosts.value.filter(t => t !== leftToken)
        updateLastPublicHostsUpdate()
      }
    })

    // Peer desconectado: si era host público, quitarlo del lobby
    wsProxyClient.on('peer_disconnected', (peerToken) => {
      if (publicHosts.value.includes(peerToken)) {
        publicHosts.value = publicHosts.value.filter(t => t !== peerToken)
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
    shortToken,
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
    unpublishFromChessHosts,
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