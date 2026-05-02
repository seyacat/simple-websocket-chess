// Store para la lógica del jugador/guest
// Maneja la vista local del juego, interacción de UI y comunicación con el host

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useConnectionStore } from './connectionStore'
import {
  COLORS,
  getValidMoves,
  isValidMoveForPlayer,
  getAlgebraicNotation,
  MESSAGE_TYPES,
  GAME_STATUS,
  SEAT_COLORS,
  formatWebSocketMessage,
  parseWebSocketMessage,
  createInitialGameState,
  applyMove
} from './sharedGameLogic'

export const usePlayerGameStore = defineStore('playerGame', () => {
  // Estado local del juego (vista del jugador)
  const board = ref([])
  const currentTurn = ref(COLORS.WHITE)
  const selectedPiece = ref(null) // {row, col} o null
  const validMoves = ref([]) // Array de {row, col}
  const gameStatus = ref(GAME_STATUS.WAITING)
  const moveHistory = ref([])
  const playerColor = ref(COLORS.WHITE) // Color asignado al jugador local
  const timers = ref({ white: 0, black: 0, lastUpdate: Date.now() })
  
  // Timeout para asegurar que los movimientos lleguen al host
  const pendingMoveTimeout = ref(null)


  
  // Versión del último estado recibido del host (para detección de desync)
  // null = aún no hemos recibido ningún estado del host
  const lastVersion = ref(null) // { seq: number, ts: number }
  
  // Sistema de asientos (vista local)
  const seats = ref({
    white: { occupied: false, playerToken: null, playerName: null },
    black: { occupied: false, playerToken: null, playerName: null }
  })
  
  const spectators = ref([]) // Array de tokens de espectadores
  
  // Stores y servicios
  const connectionStore = useConnectionStore()
  
  // ─────────────────────────────────────────────────────────────────
  // Inicialización
  // ─────────────────────────────────────────────────────────────────
  
  function initializeBoard() {
    const initialGameState = createInitialGameState()
    board.value = initialGameState.board
    currentTurn.value = initialGameState.currentTurn
    gameStatus.value = initialGameState.gameStatus
    moveHistory.value = initialGameState.moveHistory
    seats.value = initialGameState.seats
    spectators.value = initialGameState.spectators
    playerColor.value = COLORS.WHITE
    selectedPiece.value = null
    validMoves.value = []
    lastVersion.value = null
    timers.value = initialGameState.timers || { white: 0, black: 0, lastUpdate: Date.now() }
  }
  
  // ─────────────────────────────────────────────────────────────────
  // Getters
  // ─────────────────────────────────────────────────────────────────
  
  const isMyTurn = computed(() => currentTurn.value === playerColor.value)
  
  const winner = computed(() => {
    if (gameStatus.value === GAME_STATUS.CHECKMATE) {
      return currentTurn.value === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE
    }
    return null
  })
  
  const boardState = computed(() => board.value)
  
  const isSeated = computed(() =>
    seats.value.white.playerToken === connectionStore.token ||
    seats.value.black.playerToken === connectionStore.token
  )
  
  const mySeatColor = computed(() => {
    if (seats.value.white.playerToken === connectionStore.token) return SEAT_COLORS.WHITE
    if (seats.value.black.playerToken === connectionStore.token) return SEAT_COLORS.BLACK
    return null
  })
  
  const isSpectator = computed(() =>
    !isSeated.value && spectators.value.includes(connectionStore.token)
  )
  
  const hostInstanceActive = computed(() => connectionStore.isSubscribed)
  
  const bothSeatsOccupied = computed(() =>
    seats.value.white.occupied && seats.value.black.occupied
  )
  
  const availableSeats = computed(() => {
    const available = []
    if (!seats.value.white.occupied) available.push(SEAT_COLORS.WHITE)
    if (!seats.value.black.occupied) available.push(SEAT_COLORS.BLACK)
    return available
  })
  
  const spectatorsCount = computed(() => spectators.value.length)
  
  // ─────────────────────────────────────────────────────────────────
  // Acciones del jugador
  // ─────────────────────────────────────────────────────────────────
  
  function selectPiece(position) {
    if (gameStatus.value !== GAME_STATUS.PLAYING && gameStatus.value !== GAME_STATUS.CHECK) return
    if (!isMyTurn.value) { console.log('No es tu turno'); return }
    
    const { row, col } = position
    const piece = board.value[row][col]
    
    if (!piece ||
        (playerColor.value === COLORS.WHITE && piece === piece.toLowerCase()) ||
        (playerColor.value === COLORS.BLACK && piece === piece.toUpperCase())) {
      selectedPiece.value = null
      validMoves.value = []
      return
    }
    
    selectedPiece.value = position
    validMoves.value = getValidMoves(board.value, row, col, piece, moveHistory.value)
  }
  
  function makeMove(toPosition) {
    if (!selectedPiece.value ||
        (gameStatus.value !== GAME_STATUS.PLAYING && gameStatus.value !== GAME_STATUS.CHECK)) {
      return false
    }
    
    const { row: fromRow, col: fromCol } = selectedPiece.value
    const { row: toRow, col: toCol } = toPosition
    
    const isValidMove = validMoves.value.some(m => m.row === toRow && m.col === toCol)
    if (!isValidMove) { console.log('Movimiento inválido'); return false }
    
    const piece = board.value[fromRow][fromCol]
    const capturedPiece = board.value[toRow][toCol]
    
    const moveData = {
      from: { row: fromRow, col: fromCol },
      to: { row: toRow, col: toCol },
      piece,
      captured: capturedPiece,
      timestamp: Date.now(),
      playerToken: connectionStore.token
    }
    
    sendMoveToHost(moveData)
    selectedPiece.value = null
    validMoves.value = []
    
    return true
  }
  
  function sendMoveToHost(moveData) {
    if (!connectionStore.isConnected || !connectionStore.subscribedHost) {
      console.error('No hay conexión o no estás suscrito a un host')
      return
    }
    
    const message = formatWebSocketMessage(MESSAGE_TYPES.MOVE, moveData)
    connectionStore.sendMessage(connectionStore.subscribedHost, message).then(() => {
      // Timeout backup if host doesn't acknowledge within 5s
      if (pendingMoveTimeout.value) {
        clearTimeout(pendingMoveTimeout.value)
      }
      pendingMoveTimeout.value = setTimeout(() => {
        console.warn('Timeout enviando movimiento. Solicitando estado completo...')
        requestFullState()
        pendingMoveTimeout.value = null
      }, 5000)
    }).catch(error => {
      console.error('Error enviando movimiento al host:', error)
    })
  }
  
  function requestSeat(color) {
    if (!connectionStore.isConnected || !connectionStore.subscribedHost) {
      console.error('No hay conexión o no estás suscrito a un host')
      return false
    }
    
    if (seats.value[color].occupied) {
      console.log(`Asiento ${color} ya está ocupado`)
      return false
    }
    
    const seatRequestData = {
      color,
      playerToken: connectionStore.token,
      playerName: connectionStore.myNickname || connectionStore.token || `Jugador ${color}`,
      timestamp: Date.now()
    }
    
    const message = formatWebSocketMessage(MESSAGE_TYPES.SEAT_REQUEST, seatRequestData)
    connectionStore.sendMessage(connectionStore.subscribedHost, message).catch(error => {
      console.error('Error solicitando asiento:', error)
    })
    
    return true
  }
  
  function requestLeaveSeat() {
    if (!isSeated.value || !connectionStore.subscribedHost) return false
    
    const leaveSeatData = {
      color: mySeatColor.value,
      playerToken: connectionStore.token,
      timestamp: Date.now()
    }
    
    const message = formatWebSocketMessage(MESSAGE_TYPES.LEAVE_SEAT, leaveSeatData)
    connectionStore.sendMessage(connectionStore.subscribedHost, message).catch(error => {
      console.error('Error solicitando salir del asiento:', error)
    })
    
    return true
  }
  
  function surrender() {
    if (!connectionStore.subscribedHost) return
    
    const surrenderData = { playerToken: connectionStore.token, timestamp: Date.now() }
    const message = formatWebSocketMessage(MESSAGE_TYPES.SURRENDER, surrenderData)
    connectionStore.sendMessage(connectionStore.subscribedHost, message).catch(error => {
      console.error('Error enviando rendición:', error)
    })
  }
  
  // ─────────────────────────────────────────────────────────────────
  // Solicitar estado completo al host
  // ─────────────────────────────────────────────────────────────────
  
  /**
   * Envía REQUEST_FULL_STATE al host.
   * Se usa al conectarse y cuando se detecta desync.
   */
  function requestFullState(hostToken) {
    const target = hostToken || connectionStore.subscribedHost
    if (!target || !connectionStore.isConnected) {
      console.warn('[Guest] No se puede solicitar estado: sin host o sin conexión')
      return
    }
    
    const message = formatWebSocketMessage(MESSAGE_TYPES.REQUEST_FULL_STATE, {
      requestedAt: Date.now()
    })
    connectionStore.sendMessage(target, message).catch(error => {
      console.error('Error enviando REQUEST_FULL_STATE:', error)
    })
    
    console.log(`[Guest] REQUEST_FULL_STATE enviado a ${target}`)
  }
  
  // ─────────────────────────────────────────────────────────────────
  // Aplicar actualizaciones del host
  // ─────────────────────────────────────────────────────────────────
  
  function applyUpdateFromHost(type, data) {
    if (pendingMoveTimeout.value) {
      if (
        type === MESSAGE_TYPES.MOVE_APPLIED ||
        type === MESSAGE_TYPES.GAME_STATE_UPDATE ||
        type === MESSAGE_TYPES.FULL_STATE_RESPONSE
      ) {
        clearTimeout(pendingMoveTimeout.value)
        pendingMoveTimeout.value = null
      }
    }

    switch (type) {
      case MESSAGE_TYPES.FULL_STATE_RESPONSE:
        applyFullGameStateUpdate(data)
        if (data.version) lastVersion.value = data.version
        console.log(`[Guest] Estado completo recibido (v${data.version?.seq ?? '?'})`)
        break
        
      case MESSAGE_TYPES.GAME_STATE_UPDATE:
        applyFullGameStateUpdate(data)
        break
        
      case MESSAGE_TYPES.MOVE_APPLIED:
        if (data.newState) {
          if (data.newState.timers) timers.value = data.newState.timers
          if (data.newState.currentTurn) currentTurn.value = data.newState.currentTurn
          if (data.newState.gameStatus) gameStatus.value = data.newState.gameStatus
        }
        applyMoveFromHost(data.move)
        break
        
      case MESSAGE_TYPES.SEATS_UPDATE:
        applySeatsUpdate(data)
        break
        
      case MESSAGE_TYPES.GAME_START:
        applyGameStart(data)
        break
        
      case MESSAGE_TYPES.GAME_START_AUTO:
        applyGameStart(data)
        break
        
      case MESSAGE_TYPES.GAME_END:
        applyGameEnd(data)
        break
        
      case MESSAGE_TYPES.SPECTATOR_JOINED:
        applySpectatorJoined(data)
        break
        
      case MESSAGE_TYPES.SPECTATOR_LEFT:
        applySpectatorLeft(data)
        break
        
      default:
        console.log('Tipo de actualización no reconocido:', type)
    }
  }
  
  function applyFullGameStateUpdate(gameState) {
    if (gameState.board) board.value = gameState.board
    if (gameState.currentTurn) currentTurn.value = gameState.currentTurn
    if (gameState.gameStatus) gameStatus.value = gameState.gameStatus
    if (gameState.moveHistory) moveHistory.value = gameState.moveHistory
    if (gameState.seats) seats.value = gameState.seats
    if (gameState.spectators) spectators.value = gameState.spectators
    if (gameState.timers) timers.value = gameState.timers
    
    // Detectar el color del jugador mirando los asientos
    const myToken = connectionStore.token
    if (myToken && gameState.seats) {
      if (gameState.seats.white?.playerToken === myToken) {
        playerColor.value = COLORS.WHITE
      } else if (gameState.seats.black?.playerToken === myToken) {
        playerColor.value = COLORS.BLACK
      }
    }
  }
  
  function applyMoveFromHost(moveData) {
    const { from, to, piece } = moveData
    
    const oldBoard = board.value.map(row => [...row])
    board.value = applyMove(board.value, from.row, from.col, to.row, to.col)
    
    const moveNotation = getAlgebraicNotation(moveData, oldBoard, board.value)
    moveHistory.value.push({
      from, to, piece,
      captured: moveData.captured || '',
      notation: moveNotation,
      turn: currentTurn.value,
      isRemote: true
    })
    
    console.log('[Guest] Historial de movimientos (Objetos):', JSON.parse(JSON.stringify(moveHistory.value)))
    const notations = moveHistory.value.map(m => m.notation)
    console.log('[Guest] Historial de movimientos (Notación):', notations)
    
    if (selectedPiece.value &&
        selectedPiece.value.row === from.row &&
        selectedPiece.value.col === from.col) {
      selectedPiece.value = null
      validMoves.value = []
    }
  }
  
  function applySeatsUpdate(seatsUpdate) {
    if (seatsUpdate.seats) seats.value = seatsUpdate.seats
    
    const myToken = connectionStore.token
    if (myToken && seats.value) {
      if (seats.value.white?.playerToken === myToken) {
        playerColor.value = COLORS.WHITE
      } else if (seats.value.black?.playerToken === myToken) {
        playerColor.value = COLORS.BLACK
      }
    }
  }
  
  function applyGameStart(gameStartData) {
    gameStatus.value = GAME_STATUS.PLAYING
    currentTurn.value = COLORS.WHITE
    if (gameStartData.timers) {
      timers.value = gameStartData.timers
    } else {
      timers.value = { white: 0, black: 0, lastUpdate: Date.now() }
    }
    
    if (gameStartData.color && gameStartData.playerToken === connectionStore.token) {
      playerColor.value = gameStartData.color
    }
  }
  
  function applyGameEnd(gameEndData) {
    console.log('Juego terminado, reseteando estado local. Razón:', gameEndData?.reason || 'desconocida')
    initializeBoard()
    
    if (gameEndData?.reason === 'host_closed_game') {
      console.log('El host cerró el juego')
      connectionStore.setMode(null)
    }
  }
  
  function applySpectatorJoined(spectatorData) {
    if (!spectators.value.includes(spectatorData.token)) {
      spectators.value.push(spectatorData.token)
    }
  }
  
  function applySpectatorLeft(spectatorData) {
    const index = spectators.value.indexOf(spectatorData.token)
    if (index !== -1) spectators.value.splice(index, 1)
  }
  
  function resetLocalGame() {
    initializeBoard()
    selectedPiece.value = null
    validMoves.value = []
    playerColor.value = COLORS.WHITE
    lastVersion.value = null
  }
  
  // ─────────────────────────────────────────────────────────────────
  // WebSocket listeners
  // ─────────────────────────────────────────────────────────────────
  
  let wsListenersInitialized = false
  function initWebSocketListeners() {
    if (wsListenersInitialized) return
    wsListenersInitialized = true
    const proxyClient = connectionStore.wsProxyClient()
    
    if (!proxyClient) {
      console.warn('Proxy client no disponible para configurar listeners')
      return
    }
    
    // Handler para mensajes del host
    proxyClient.on('message', (fromToken, message, timestamp, parsedMessage) => {
      // Solo procesar mensajes del host al que estamos suscritos
      if (fromToken !== connectionStore.subscribedHost) return
      // Solo mensajes en formato de juego (TYPE|JSON), no JSON puro
      if (parsedMessage) return
      
      try {
        const parsed = parseWebSocketMessage(message)
        if (!parsed || !parsed.type) return
        
        // ── Detección de desync ──────────────────────────────────────
        // Los broadcasts (no FULL_STATE_RESPONSE) llevan version + prevVersion.
        // Si prevVersion.seq no coincide con nuestro lastVersion.seq, nos
        // perdimos un mensaje → solicitamos estado completo.
        const { version, prevVersion } = parsed.data || {}
        if (version && parsed.type !== MESSAGE_TYPES.FULL_STATE_RESPONSE) {
          if (lastVersion.value !== null && prevVersion) {
            if (prevVersion.seq !== lastVersion.value.seq) {
              console.warn(`[DESYNC] Esperaba prevVersion=${lastVersion.value.seq}, recibí prevVersion=${prevVersion.seq}. Solicitando estado completo.`)
              requestFullState(fromToken)
              return  // No aplicar este mensaje; esperar FULL_STATE_RESPONSE
            }
          }
          lastVersion.value = version
        }
        
        applyUpdateFromHost(parsed.type, parsed.data)
      } catch (error) {
        console.error('Error procesando mensaje del host:', error)
      }
    })
    
    // Handler para desconexión del host
    proxyClient.on('unpaired', (unpairedToken, timestamp) => {
      if (unpairedToken === connectionStore.subscribedHost) {
        console.log('Host desconectado, reseteando estado local del juego.')
        initializeBoard()
        connectionStore.setMode(null)
      }
    })
  }
  
  // Inicializar al crear el store
  initializeBoard()
  initWebSocketListeners()

  // Auto-solicitar estado completo cada vez que cambia el host suscrito.
  // Cubre tanto el flujo de joinPublicGame como el manual-join del lobby:
  // ambos terminan llamando a setSubscribedHost. Si el guest se reconecta
  // sin que cambie el subscribedHost, el watcher no dispara y los datos
  // siguen como estaban; en ese caso el join nuevo debe pasar por el flujo
  // explícito de salir y volver a entrar.
  watch(
    () => connectionStore.subscribedHost,
    (newHost, oldHost) => {
      if (!newHost || newHost === oldHost) return
      // Resetear estado local: el guest verá lo que el host le mande.
      resetLocalGame()
      // Esperar a estar conectado antes de pedir estado.
      if (connectionStore.isConnected) {
        requestFullState(newHost)
      } else {
        const stop = watch(
          () => connectionStore.isConnected,
          (connected) => {
            if (!connected) return
            requestFullState(newHost)
            stop()
          }
        )
      }
    }
  )
  
  return {
    // Estado
    board,
    currentTurn,
    selectedPiece,
    validMoves,
    gameStatus,
    moveHistory,
    playerColor,
    seats,
    spectators,
    timers,
    lastVersion,
    
    // Getters
    isMyTurn,
    winner,
    boardState,
    isSeated,
    mySeatColor,
    isSpectator,
    hostInstanceActive,
    bothSeatsOccupied,
    availableSeats,
    spectatorsCount,
    
    // Acciones
    selectPiece,
    makeMove,
    sendMoveToHost,
    applyMoveFromHost,
    requestSeat,
    requestLeaveSeat,
    applyUpdateFromHost,
    requestFullState,
    resetLocalGame,
    surrender,
    initializeBoard
  }
})