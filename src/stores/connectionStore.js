import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useConnectionStore = defineStore('connection', () => {
  // Estado
  const uuid = ref(null)
  const shortToken = ref(null)
  const opponentToken = ref(null)
  const isConnected = ref(false)
  const connectionError = ref(null)
  const wsUrl = ref(import.meta.env.VITE_WS_URL || 'wss://closer.click:4000')
  
  // Nuevo estado para protocolo de lobby
  const mode = ref(null) // null, 'host', 'guest'
  const visibility = ref(null) // null, 'public', 'private' (solo para hosts)
  const publicHosts = ref([])
  const subscribedHost = ref(null) // token del host suscrito (para guests)
  const subscribers = ref([]) // lista de tokens de guests (para hosts)
  const lastPublicHostsUpdate = ref(null)

  // Getters
  const connectionStatus = computed(() => {
    if (connectionError.value) return 'error'
    if (isConnected.value) return 'connected'
    return 'disconnected'
  })

  const hasToken = computed(() => !!shortToken.value)
  const hasOpponent = computed(() => !!opponentToken.value)
  const canPlay = computed(() => isConnected.value && hasOpponent.value)
  
  // Nuevos getters para protocolo de lobby
  const isHost = computed(() => mode.value === 'host')
  const isGuest = computed(() => mode.value === 'guest')
  const isPublicHost = computed(() => isHost.value && visibility.value === 'public')
  const hasSubscribers = computed(() => subscribers.value.length > 0)
  const subscribersCount = computed(() => subscribers.value.length)
  const isSubscribed = computed(() => !!subscribedHost.value)

  // Acciones
  const setUuid = (newUuid) => {
    uuid.value = newUuid
    if (newUuid) {
      localStorage.setItem('chess_uuid', newUuid)
    } else {
      localStorage.removeItem('chess_uuid')
    }
  }

  const setShortToken = (token) => {
    shortToken.value = token
    if (token) {
      localStorage.setItem('chess_short_token', token)
    } else {
      localStorage.removeItem('chess_short_token')
    }
  }

  const setOpponentToken = (token) => {
    opponentToken.value = token
    if (token) {
      localStorage.setItem('chess_opponent_token', token)
    } else {
      localStorage.removeItem('chess_opponent_token')
    }
  }

  const setConnected = (connected) => {
    isConnected.value = connected
    if (!connected) {
      connectionError.value = null
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
    uuid.value = null
    shortToken.value = null
    opponentToken.value = null
    isConnected.value = false
    connectionError.value = null
    
    // Resetear estado de lobby
    mode.value = null
    visibility.value = null
    publicHosts.value = []
    subscribedHost.value = null
    subscribers.value = []
    lastPublicHostsUpdate.value = null
    
    localStorage.removeItem('chess_uuid')
    localStorage.removeItem('chess_short_token')
    localStorage.removeItem('chess_opponent_token')
    localStorage.removeItem('chess_mode')
    localStorage.removeItem('chess_visibility')
    localStorage.removeItem('chess_subscribed_host')
  }

  // Nuevas acciones para protocolo de lobby
  const setMode = (newMode, newVisibility = null) => {
    mode.value = newMode
    visibility.value = newVisibility
    
    if (newMode) {
      localStorage.setItem('chess_mode', newMode)
    } else {
      localStorage.removeItem('chess_mode')
    }
    
    if (newVisibility) {
      localStorage.setItem('chess_visibility', newVisibility)
    } else {
      localStorage.removeItem('chess_visibility')
    }
    
    // Resetear estado relacionado al cambiar modo
    if (newMode === 'host') {
      subscribedHost.value = null
      subscribers.value = []
    } else if (newMode === 'guest') {
      subscribers.value = []
    }
  }

  const setPublicHosts = (hosts) => {
    publicHosts.value = hosts || []
  }

  const setSubscribedHost = (hostToken) => {
    subscribedHost.value = hostToken
    if (hostToken) {
      localStorage.setItem('chess_subscribed_host', hostToken)
    } else {
      localStorage.removeItem('chess_subscribed_host')
    }
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

  // Cargar estado guardado del localStorage
  const loadSavedState = () => {
    const savedUuid = localStorage.getItem('chess_uuid')
    const savedShortToken = localStorage.getItem('chess_short_token')
    const savedOpponentToken = localStorage.getItem('chess_opponent_token')
    const savedMode = localStorage.getItem('chess_mode')
    const savedVisibility = localStorage.getItem('chess_visibility')
    const savedSubscribedHost = localStorage.getItem('chess_subscribed_host')
    
    if (savedUuid) uuid.value = savedUuid
    if (savedShortToken) shortToken.value = savedShortToken
    if (savedOpponentToken) opponentToken.value = savedOpponentToken
    if (savedMode) mode.value = savedMode
    if (savedVisibility) visibility.value = savedVisibility
    if (savedSubscribedHost) subscribedHost.value = savedSubscribedHost
  }

  // Inicializar cargando estado guardado
  loadSavedState()

  return {
    // Estado
    uuid,
    shortToken,
    opponentToken,
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
    hasOpponent,
    canPlay,
    
    // Nuevos getters para protocolo de lobby
    isHost,
    isGuest,
    isPublicHost,
    hasSubscribers,
    subscribersCount,
    isSubscribed,
    
    // Acciones
    setUuid,
    setShortToken,
    setOpponentToken,
    setConnected,
    setError,
    clearError,
    reset,
    loadSavedState,
    
    // Nuevas acciones para protocolo de lobby
    setMode,
    setPublicHosts,
    setSubscribedHost,
    addSubscriber,
    removeSubscriber,
    clearSubscribers,
    updateLastPublicHostsUpdate
  }
})