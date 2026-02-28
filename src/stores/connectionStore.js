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

  // Getters
  const connectionStatus = computed(() => {
    if (connectionError.value) return 'error'
    if (isConnected.value) return 'connected'
    return 'disconnected'
  })

  const hasToken = computed(() => !!shortToken.value)
  const hasOpponent = computed(() => !!opponentToken.value)
  const canPlay = computed(() => isConnected.value && hasOpponent.value)

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
    
    localStorage.removeItem('chess_uuid')
    localStorage.removeItem('chess_short_token')
    localStorage.removeItem('chess_opponent_token')
  }

  // Cargar estado guardado del localStorage
  const loadSavedState = () => {
    const savedUuid = localStorage.getItem('chess_uuid')
    const savedShortToken = localStorage.getItem('chess_short_token')
    const savedOpponentToken = localStorage.getItem('chess_opponent_token')
    
    if (savedUuid) uuid.value = savedUuid
    if (savedShortToken) shortToken.value = savedShortToken
    if (savedOpponentToken) opponentToken.value = savedOpponentToken
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
    
    // Getters
    connectionStatus,
    hasToken,
    hasOpponent,
    canPlay,
    
    // Acciones
    setUuid,
    setShortToken,
    setOpponentToken,
    setConnected,
    setError,
    clearError,
    reset,
    loadSavedState
  }
})