// Store para la lógica del host/servidor de juego
// Maneja el estado autoritativo del juego, validación y broadcast a jugadores

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useConnectionStore } from './connectionStore'
import {
  COLORS,
  getValidMoves,
  isValidMove,
  applyMove as applyMoveToBoard,
  isKingInCheck,
  isCheckmate,
  isStalemate,
  getAlgebraicNotation,
  MESSAGE_TYPES,
  GAME_STATUS,
  SEAT_COLORS,
  formatWebSocketMessage,
  parseWebSocketMessage,
  createInitialGameState,
  createInitialSeats,
  isValidMoveForPlayer,
  createVersion
} from './sharedGameLogic'

export const useHostGameStore = defineStore('hostGame', () => {
  // Estado autoritativo del juego (source of truth)
  const gameState = ref(createInitialGameState())
  
  // Versioning para detección de desync en guests
  const currentVersion = ref(createVersion(0))
  const prevVersion = ref(createVersion(0))
  
  // Estado local del host como jugador (cuando ocupa un asiento)
  const hostAsPlayerColor = ref(null) // 'white', 'black', o null si no juega
  const hostSelectedPiece = ref(null)
  const hostValidMoves = ref([])
  
  // Stores y servicios
  const connectionStore = useConnectionStore()
  
  // Getters para acceso conveniente al estado
  const board = computed(() => gameState.value.board)
  const currentTurn = computed(() => gameState.value.currentTurn)
  const gameStatus = computed(() => gameState.value.gameStatus)
  const moveHistory = computed(() => gameState.value.moveHistory)
  const seats = computed(() => gameState.value.seats)
  const spectators = computed(() => gameState.value.spectators)
  const timers = computed(() => gameState.value.timers)

  
  // Getters adicionales
  const isHostPlaying = computed(() => hostAsPlayerColor.value !== null)
  const isHostTurn = computed(() => {
    return isHostPlaying.value && currentTurn.value === hostAsPlayerColor.value
  })
  
  // Indica si la instancia del host está activa
  const hostInstanceActive = computed(() => {
    return connectionStore.isHost && gameState.value.gameStatus !== undefined
  })
  
  const bothSeatsOccupied = computed(() => {
    return seats.value.white.occupied && seats.value.black.occupied
  })
  
  const availableSeats = computed(() => {
    const available = []
    if (!seats.value.white.occupied) available.push(SEAT_COLORS.WHITE)
    if (!seats.value.black.occupied) available.push(SEAT_COLORS.BLACK)
    return available
  })
  
  const spectatorsCount = computed(() => spectators.value.length)
  
  // ─────────────────────────────────────────────────────────────────
  // Versioning
  // ─────────────────────────────────────────────────────────────────
  
  /**
   * Incrementa el contador de versión antes de cada broadcast.
   * prevVersion guarda la versión anterior para que el guest pueda
   * detectar si se perdió algún mensaje.
   */
  function bumpVersion() {
    prevVersion.value = { ...currentVersion.value }
    currentVersion.value = { seq: currentVersion.value.seq + 1, ts: Date.now() }
  }

  // ─────────────────────────────────────────────────────────────────
  // Acciones del host como servidor/autoridad
  // ─────────────────────────────────────────────────────────────────
  
  /**
   * Inicializa un nuevo juego como host
   */
  function initializeGameAsHost() {
    gameState.value = createInitialGameState()
    hostAsPlayerColor.value = null
    hostSelectedPiece.value = null
    hostValidMoves.value = []
    currentVersion.value = createVersion(0)
    prevVersion.value = createVersion(0)
  }
  
  /**
   * Maneja un mensaje recibido de un guest
   * @param {string} guestToken - Token del guest que envió el mensaje
   * @param {string} message - Mensaje en formato "TYPE|JSON_DATA"
   */
  function handleGuestMessage(guestToken, message) {
    const parsed = parseWebSocketMessage(message)
    
    switch (parsed.type) {
      case MESSAGE_TYPES.REQUEST_FULL_STATE:
        handleFullStateRequest(guestToken)
        break
        
      case MESSAGE_TYPES.SEAT_REQUEST:
        handleSeatRequest(guestToken, parsed.data)
        break
        
      case MESSAGE_TYPES.MOVE:
        handleMoveRequest(guestToken, parsed.data)
        break
        
      case MESSAGE_TYPES.LEAVE_SEAT:
        handleLeaveSeat(guestToken, parsed.data)
        break
        
      case MESSAGE_TYPES.SURRENDER:
        handleSurrender(guestToken, parsed.data)
        break
        
      case MESSAGE_TYPES.CHAT_MESSAGE:
        handleChatMessage(guestToken, parsed.data)
        break
        
      default:
        console.log('Tipo de mensaje de guest no reconocido:', parsed.type)
    }
  }
  
  /**
   * Responde a un REQUEST_FULL_STATE de un guest.
   * También registra al guest como espectador si es la primera vez que escribe.
   * @param {string} guestToken
   */
  function handleFullStateRequest(guestToken) {
    // Registrar al guest como suscriptor del host (para futuros broadcasts)
    connectionStore.addSubscriber(guestToken)
    
    // Auto-registrar como espectador si no estaba en el juego todavía
    const isInSeat = getSeatColorByToken(guestToken) !== null
    const isSpectating = spectators.value.includes(guestToken)
    if (!isInSeat && !isSpectating) {
      addSpectator(guestToken, 'Guest')
    }
    
    // Responder solo al guest solicitante (no broadcast)
    const msg = formatWebSocketMessage(MESSAGE_TYPES.FULL_STATE_RESPONSE, {
      board: gameState.value.board,
      currentTurn: gameState.value.currentTurn,
      gameStatus: gameState.value.gameStatus,
      moveHistory: gameState.value.moveHistory,
      seats: gameState.value.seats,
      spectators: gameState.value.spectators,
      timers: gameState.value.timers,
      version: currentVersion.value
    })
    connectionStore.sendMessage(guestToken, msg).catch(err => {
      console.error('Error enviando FULL_STATE_RESPONSE a guest:', err)
    })
    
    console.log(`[Host] FULL_STATE_RESPONSE enviado a ${guestToken} (v${currentVersion.value.seq})`)
  }
  
  /**
   * Maneja una solicitud de asiento de un guest
   * @param {string} guestToken - Token del guest
   * @param {Object} data - Datos de la solicitud {color, playerToken, playerName}
   */
  function handleSeatRequest(guestToken, data) {
    const { color, playerToken, playerName } = data
    
    // Validar que el asiento esté disponible
    if (seats.value[color].occupied) {
      console.log(`Asiento ${color} ya está ocupado, rechazando solicitud de ${guestToken}`)
      return
    }
    
    // Si el jugador ya está en otro asiento, liberarlo primero
    if (seats.value.white.playerToken === playerToken) {
      vacateSeat(SEAT_COLORS.WHITE, playerToken)
    } else if (seats.value.black.playerToken === playerToken) {
      vacateSeat(SEAT_COLORS.BLACK, playerToken)
    }
    
    // Remover de espectadores si está allí
    removeSpectator(playerToken)
    
    // Ocupar asiento
    gameState.value.seats[color].occupied = true
    gameState.value.seats[color].playerToken = playerToken
    gameState.value.seats[color].playerName = playerName || `Jugador ${color}`
    
    // Broadcast actualización de asientos
    broadcastGameUpdate(MESSAGE_TYPES.SEATS_UPDATE, {
      seats: gameState.value.seats,
      changedColor: color,
      playerToken,
      playerName
    })
    
    // Verificar si el juego debe comenzar
    checkAndStartGame()
  }
  
  /**
   * Maneja una solicitud de movimiento de un guest
   * @param {string} guestToken - Token del guest
   * @param {Object} moveData - Datos del movimiento
   */
  function handleMoveRequest(guestToken, moveData) {
    const guestSeatColor = getSeatColorByToken(guestToken)
    if (!guestSeatColor) {
      console.log(`Guest ${guestToken} no está en un asiento, ignorando movimiento`)
      return
    }
    
    if (currentTurn.value !== guestSeatColor) {
      console.log(`No es el turno de ${guestSeatColor}, ignorando movimiento`)
      return
    }
    
    const isValid = validateMove(moveData, guestSeatColor)
    if (!isValid) {
      console.log('Movimiento inválido:', moveData)
      return
    }
    
    applyMove(moveData)
    
    checkGameStatus()
    
    broadcastGameUpdate(MESSAGE_TYPES.MOVE_APPLIED, {
      move: moveData,
      newState: {
        board: gameState.value.board,
        currentTurn: gameState.value.currentTurn,
        gameStatus: gameState.value.gameStatus,
        timers: gameState.value.timers
      }
    })
  }
  
  /**
   * Maneja una solicitud para abandonar asiento
   * @param {string} guestToken - Token del guest
   * @param {Object} data - Datos de la solicitud {color, playerToken}
   */
  function handleLeaveSeat(guestToken, data) {
    const { color } = data
    
    if (seats.value[color].playerToken !== guestToken) {
      console.log(`Guest ${guestToken} no ocupa el asiento ${color}`)
      return
    }
    
    vacateSeat(color, guestToken)
  }
  
  /**
   * Maneja una rendición
   * @param {string} guestToken - Token del guest
   * @param {Object} data - Datos de la rendición
   */
  function handleSurrender(guestToken, data) {
    const guestSeatColor = getSeatColorByToken(guestToken)
    if (!guestSeatColor) return
    
    const winner = guestSeatColor === SEAT_COLORS.WHITE ? SEAT_COLORS.BLACK : SEAT_COLORS.WHITE
    endGame(winner, 'surrender')
  }
  
  /**
   * Maneja un mensaje de chat
   * @param {string} guestToken - Token del guest
   * @param {Object} data - Datos del mensaje de chat
   */
  function handleChatMessage(guestToken, data) {
    broadcastGameUpdate(MESSAGE_TYPES.CHAT_MESSAGE, {
      ...data,
      playerToken: guestToken,
      timestamp: Date.now()
    })
  }
  
  /**
   * Valida un movimiento
   */
  function validateMove(moveData, playerColor) {
    const { from, to, piece } = moveData
    
    if (!isValidMoveForPlayer(board.value, from, to, piece, playerColor, gameState.value.moveHistory)) {
      return false
    }
    
    return isValidMove(board.value, from.row, from.col, to.row, to.col, gameState.value.moveHistory)
  }
  
  /**
   * Aplica un movimiento validado al estado autoritativo
   */
  function applyMove(moveData) {
    const { from, to, piece } = moveData
    
    // Actualizar cronómetros antes de cambiar de turno
    const now = Date.now()
    if (gameState.value.gameStatus === GAME_STATUS.PLAYING) {
      const elapsed = now - gameState.value.timers.lastUpdate
      gameState.value.timers[currentTurn.value] += elapsed
    }
    gameState.value.timers.lastUpdate = now
    
    const newBoard = applyMoveToBoard(board.value, from.row, from.col, to.row, to.col, piece)
    gameState.value.board = newBoard
    
    const capturedPiece = moveData.captured || ''
    const moveNotation = getAlgebraicNotation(from.row, from.col, to.row, to.col, capturedPiece)
    gameState.value.moveHistory.push({
      ...moveData,
      notation: moveNotation,
      turn: currentTurn.value
    })
    
    console.log('[Host] Historial de movimientos:', JSON.parse(JSON.stringify(gameState.value.moveHistory)))
    
    gameState.value.currentTurn = currentTurn.value === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE
  }
  
  /**
   * Libera un asiento
   */
  function vacateSeat(color, playerToken) {
    if (!seats.value[color].occupied || seats.value[color].playerToken !== playerToken) {
      return
    }
    
    gameState.value.seats[color].occupied = false
    const playerName = gameState.value.seats[color].playerName
    gameState.value.seats[color].playerToken = null
    gameState.value.seats[color].playerName = null
    
    if (playerToken !== connectionStore.token) {
      addSpectator(playerToken, playerName || `Ex-${color}`)
    }
    
    if (gameStatus.value === GAME_STATUS.PLAYING || gameStatus.value === GAME_STATUS.CHECK) {
      const occupiedCount = (seats.value.white.occupied ? 1 : 0) + (seats.value.black.occupied ? 1 : 0)
      if (occupiedCount === 1) {
        gameState.value.gameStatus = GAME_STATUS.PAUSED
      }
    }
    
    broadcastGameUpdate(MESSAGE_TYPES.SEATS_UPDATE, {
      seats: gameState.value.seats,
      changedColor: color,
      playerToken,
      action: 'vacated'
    })
    
    if (playerToken === connectionStore.token && hostAsPlayerColor.value === color) {
      hostAsPlayerColor.value = null
      hostSelectedPiece.value = null
      hostValidMoves.value = []
    }
  }
  
  /**
   * Añade un espectador
   */
  function addSpectator(token, playerName = null) {
    if (!spectators.value.includes(token)) {
      gameState.value.spectators.push(token)
      
      broadcastGameUpdate(MESSAGE_TYPES.SPECTATOR_JOINED, {
        token,
        playerName: playerName || 'Espectador'
      })
    }
  }
  
  /**
   * Remueve un espectador
   */
  function removeSpectator(token) {
    const index = spectators.value.indexOf(token)
    if (index !== -1) {
      gameState.value.spectators.splice(index, 1)
      
      broadcastGameUpdate(MESSAGE_TYPES.SPECTATOR_LEFT, {
        token
      })
    }
  }
  
  /**
   * Verifica y actualiza el estado del juego
   */
  function checkGameStatus() {
    const currentColor = currentTurn.value
    
    if (isCheckmate(board.value, currentColor)) {
      gameState.value.gameStatus = GAME_STATUS.CHECKMATE
      endGame(currentColor === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE, 'checkmate')
    } else if (isStalemate(board.value, currentColor)) {
      gameState.value.gameStatus = GAME_STATUS.STALEMATE
      endGame(null, 'stalemate')
    } else if (isKingInCheck(board.value, currentColor)) {
      gameState.value.gameStatus = GAME_STATUS.CHECK
    } else if (gameState.value.gameStatus === GAME_STATUS.WAITING) {
      gameState.value.gameStatus = GAME_STATUS.PLAYING
    } else if (gameState.value.gameStatus === GAME_STATUS.CHECK ||
               gameState.value.gameStatus === GAME_STATUS.PLAYING) {
      if (!isKingInCheck(board.value, currentColor)) {
        gameState.value.gameStatus = GAME_STATUS.PLAYING
      }
    }
    
    if (gameState.value.gameStatus === GAME_STATUS.CHECK ||
        gameState.value.gameStatus === GAME_STATUS.CHECKMATE ||
        gameState.value.gameStatus === GAME_STATUS.STALEMATE) {
      broadcastGameUpdate(MESSAGE_TYPES.GAME_STATE_UPDATE, {
        gameStatus: gameState.value.gameStatus
      })
    }
  }
  
  /**
   * Verifica si el juego debe comenzar automáticamente
   */
  function checkAndStartGame() {
    if (bothSeatsOccupied.value && gameStatus.value === GAME_STATUS.WAITING) {
      startGame()
    } else if (bothSeatsOccupied.value && gameStatus.value === GAME_STATUS.PAUSED) {
      gameState.value.gameStatus = GAME_STATUS.PLAYING
      if (gameState.value.timers) {
        gameState.value.timers.lastUpdate = Date.now()
      }
      broadcastGameUpdate(MESSAGE_TYPES.GAME_START_AUTO, {
        timestamp: Date.now(),
        whitePlayer: seats.value.white.playerToken,
        blackPlayer: seats.value.black.playerToken,
        timers: gameState.value.timers
      })
    }
  }
  
  /**
   * Inicia el juego
   */
  function startGame() {
    gameState.value.gameStatus = GAME_STATUS.PLAYING
    gameState.value.currentTurn = COLORS.WHITE
    gameState.value.timers = { white: 0, black: 0, lastUpdate: Date.now() }
    
    if (moveHistory.value.length === 0) {
      const initialGameState = createInitialGameState()
      gameState.value.board = initialGameState.board
      // The initial board includes timers now, but we just reset it above
    }
    
    broadcastGameUpdate(MESSAGE_TYPES.GAME_START, {
      timestamp: Date.now(),
      whitePlayer: seats.value.white.playerToken,
      blackPlayer: seats.value.black.playerToken,
      timers: gameState.value.timers
    })
  }
  
  /**
   * Termina el juego
   */
  function endGame(winner, reason) {
    gameState.value.gameStatus = GAME_STATUS.FINISHED
    
    broadcastGameUpdate(MESSAGE_TYPES.GAME_END, {
      winner,
      reason,
      timestamp: Date.now()
    })
  }
  
  /**
   * Envía una actualización de juego a todos los subscribers.
   * Incrementa la versión antes de cada broadcast para que los guests
   * puedan detectar mensajes perdidos (desync).
   * @param {string} type - Tipo de mensaje
   * @param {Object} data - Datos de la actualización
   */
  function broadcastGameUpdate(type, data) {
    if (!connectionStore.isHost || !connectionStore.hasSubscribers) {
      return
    }
    
    bumpVersion()
    
    const message = formatWebSocketMessage(type, {
      ...data,
      version: currentVersion.value,
      prevVersion: prevVersion.value
    })
    connectionStore.broadcastToSubscribers(message)
  }
  
  /**
   * Obtiene el color del asiento ocupado por un token
   */
  function getSeatColorByToken(token) {
    if (seats.value.white.playerToken === token) return SEAT_COLORS.WHITE
    if (seats.value.black.playerToken === token) return SEAT_COLORS.BLACK
    return null
  }
  
  // ─────────────────────────────────────────────────────────────────
  // Acciones del host como jugador (cuando ocupa un asiento)
  // ─────────────────────────────────────────────────────────────────
  
  /**
   * El host ocupa un asiento para jugar
   */
  function occupySeatAsHost(color) {
    if (seats.value[color].occupied) {
      console.log(`Asiento ${color} ya está ocupado`)
      return false
    }
    
    if (hostAsPlayerColor.value) {
      vacateSeat(hostAsPlayerColor.value, connectionStore.token)
    }
    
    gameState.value.seats[color].occupied = true
    gameState.value.seats[color].playerToken = connectionStore.token
    gameState.value.seats[color].playerName = `Host (${color})`
    hostAsPlayerColor.value = color
    
    broadcastGameUpdate(MESSAGE_TYPES.SEATS_UPDATE, {
      seats: gameState.value.seats,
      changedColor: color,
      playerToken: connectionStore.token,
      playerName: `Host (${color})`
    })
    
    checkAndStartGame()
    
    return true
  }
  
  /**
   * El host selecciona una pieza (cuando juega)
   */
  function selectPieceAsHost(position) {
    if (!isHostPlaying.value || !isHostTurn.value) {
      return
    }
    
    if (gameStatus.value !== GAME_STATUS.PLAYING && gameStatus.value !== GAME_STATUS.CHECK) {
      return
    }
    
    const { row, col } = position
    const piece = board.value[row][col]
    
    if (!piece || (hostAsPlayerColor.value === COLORS.WHITE && piece === piece.toLowerCase()) ||
        (hostAsPlayerColor.value === COLORS.BLACK && piece === piece.toUpperCase())) {
      hostSelectedPiece.value = null
      hostValidMoves.value = []
      return
    }
    
    hostSelectedPiece.value = position
    hostValidMoves.value = getValidMoves(board.value, row, col, piece, gameState.value.moveHistory)
  }
  
  /**
   * El host realiza un movimiento (cuando juega)
   */
  function makeMoveAsHost(toPosition) {
    if (!isHostPlaying.value || !isHostTurn.value || !hostSelectedPiece.value) {
      return false
    }
    
    const { row: fromRow, col: fromCol } = hostSelectedPiece.value
    const { row: toRow, col: toCol } = toPosition
    
    const isValidMoveCheck = hostValidMoves.value.some(move =>
      move.row === toRow && move.col === toCol
    )
    
    if (!isValidMoveCheck) {
      console.log('Movimiento inválido del host')
      return false
    }
    
    const piece = board.value[fromRow][fromCol]
    const moveData = {
      from: { row: fromRow, col: fromCol },
      to: { row: toRow, col: toCol },
      piece,
      captured: board.value[toRow][toCol],
      timestamp: Date.now(),
      playerToken: connectionStore.token
    }
    
    const isValid = validateMove(moveData, hostAsPlayerColor.value)
    if (!isValid) {
      console.log('Movimiento del host no válido según reglas')
      return false
    }
    
    applyMove(moveData)
    
    checkGameStatus()
    
    broadcastGameUpdate(MESSAGE_TYPES.MOVE_APPLIED, {
      move: moveData,
      newState: {
        board: gameState.value.board,
        currentTurn: gameState.value.currentTurn,
        gameStatus: gameState.value.gameStatus,
        timers: gameState.value.timers
      }
    })
    
    hostSelectedPiece.value = null
    hostValidMoves.value = []
    
    return true
  }
  
  /**
   * El host abandona su asiento
   */
  function leaveSeatAsHost() {
    if (!isHostPlaying.value) return false
    
    vacateSeat(hostAsPlayerColor.value, connectionStore.token)
    return true
  }
  
  /**
   * Reinicia el juego
   */
  function resetGame() {
    initializeGameAsHost()
  }
  
  /**
   * Destruye la instancia del host, notificando a todos los guests
   */
  function destroyHostInstance() {
    broadcastGameUpdate(MESSAGE_TYPES.GAME_END, {
      reason: 'host_closed_game',
      message: 'El host ha cerrado el juego'
    })
    
    gameState.value = createInitialGameState()
    hostAsPlayerColor.value = null
    hostSelectedPiece.value = null
    hostValidMoves.value = []
    gameState.value.spectators = []
    currentVersion.value = createVersion(0)
    prevVersion.value = createVersion(0)
    
    console.log('Instancia del host destruida')
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
    
    // Handler para mensajes directos de guests (incluyendo REQUEST_FULL_STATE)
    proxyClient.on('message', (fromToken, message, timestamp, parsedMessage) => {
      if (!connectionStore.isHost) return
      
      // Solo manejar mensajes en formato de juego (TYPE|JSON), no JSON puro
      if (parsedMessage) return  // mensajes JSON puro no son del protocolo de juego
      
      handleGuestMessage(fromToken, message)
    })
    
    // Handler para guests desconectados
    proxyClient.on('unpaired', (unpairedToken, timestamp) => {
      if (!connectionStore.isHost) return
      
      const seatColor = getSeatColorByToken(unpairedToken)
      if (seatColor) {
        vacateSeat(seatColor, unpairedToken)
      } else {
        removeSpectator(unpairedToken)
      }
      
      // También remover de la lista de subscribers del connectionStore
      connectionStore.removeSubscriber(unpairedToken)
    })
  }
  
  // Inicializar al crear el store
  initWebSocketListeners()
  
  return {
    // Estado autoritativo (getters)
    board,
    currentTurn,
    gameStatus,
    moveHistory,
    seats,
    spectators,
    timers,
    
    // Estado del host como jugador
    hostAsPlayerColor,
    hostSelectedPiece,
    hostValidMoves,
    
    // Aliases para interfaz unificada con playerGameStore (usados por PhaserChessGame)
    selectedPiece: hostSelectedPiece,
    validMoves: hostValidMoves,
    playerColor: hostAsPlayerColor,
    isMyTurn: isHostTurn,
    
    // Getters
    isHostPlaying,
    isHostTurn,
    hostInstanceActive,
    bothSeatsOccupied,
    availableSeats,
    spectatorsCount,
    
    // Acciones del host como autoridad
    initializeGameAsHost,
    handleGuestMessage,
    broadcastGameUpdate,
    startGame,
    endGame,
    resetGame,
    destroyHostInstance,
    
    // Acciones del host como jugador
    occupySeatAsHost,
    selectPieceAsHost,
    makeMoveAsHost,
    leaveSeatAsHost,
    
    // Funciones de utilidad
    getSeatColorByToken
  }
})