// Store para la lógica del host/servidor de juego
// Maneja el estado autoritativo del juego, validación y broadcast a jugadores

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useConnectionStore } from './connectionStore'
import { getWebSocketService } from '@/services/WebSocketService'
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
  isValidMoveForPlayer
} from './sharedGameLogic'

export const useHostGameStore = defineStore('hostGame', () => {
  // Estado autoritativo del juego (source of truth)
  const gameState = ref(createInitialGameState())
  
  // Estado local del host como jugador (cuando ocupa un asiento)
  const hostAsPlayerColor = ref(null) // 'white', 'black', o null si no juega
  const hostSelectedPiece = ref(null)
  const hostValidMoves = ref([])
  
  // Stores y servicios
  const connectionStore = useConnectionStore()
  const wsService = getWebSocketService()
  
  // Getters para acceso conveniente al estado
  const board = computed(() => gameState.value.board)
  const currentTurn = computed(() => gameState.value.currentTurn)
  const gameStatus = computed(() => gameState.value.gameStatus)
  const moveHistory = computed(() => gameState.value.moveHistory)
  const seats = computed(() => gameState.value.seats)
  const spectators = computed(() => gameState.value.spectators)
  
  // Getters adicionales
  const isHostPlaying = computed(() => hostAsPlayerColor.value !== null)
  const isHostTurn = computed(() => {
    return isHostPlaying.value && currentTurn.value === hostAsPlayerColor.value
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
  
  // Acciones del host como servidor/autoridad
  
  /**
   * Inicializa un nuevo juego como host
   */
  function initializeGameAsHost() {
    gameState.value = createInitialGameState()
    hostAsPlayerColor.value = null
    hostSelectedPiece.value = null
    hostValidMoves.value = []
    
    // Notificar a todos los subscribers sobre el nuevo estado
    broadcastGameUpdate(MESSAGE_TYPES.GAME_STATE_UPDATE, {
      ...gameState.value
    })
  }
  
  /**
   * Maneja un mensaje recibido de un guest
   * @param {string} guestToken - Token del guest que envió el mensaje
   * @param {string} message - Mensaje en formato "TYPE|JSON_DATA"
   */
  function handleGuestMessage(guestToken, message) {
    const parsed = parseWebSocketMessage(message)
    
    switch (parsed.type) {
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
   * Maneja una solicitud de asiento de un guest
   * @param {string} guestToken - Token del guest
   * @param {Object} data - Datos de la solicitud {color, playerToken, playerName}
   */
  function handleSeatRequest(guestToken, data) {
    const { color, playerToken, playerName } = data
    
    // Validar que el asiento esté disponible
    if (seats.value[color].occupied) {
      console.log(`Asiento ${color} ya está ocupado, rechazando solicitud de ${guestToken}`)
      // Podríamos enviar un mensaje de error al guest
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
    
    // Si el host quiere jugar, puede ocupar un asiento también
    // (esto se maneja separadamente con occupySeatAsHost)
    
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
    // Verificar que el guest tenga permiso para mover (esté en un asiento)
    const guestSeatColor = getSeatColorByToken(guestToken)
    if (!guestSeatColor) {
      console.log(`Guest ${guestToken} no está en un asiento, ignorando movimiento`)
      return
    }
    
    // Verificar que sea el turno del color del guest
    if (currentTurn.value !== guestSeatColor) {
      console.log(`No es el turno de ${guestSeatColor}, ignorando movimiento`)
      return
    }
    
    // Validar el movimiento
    const isValid = validateMove(moveData, guestSeatColor)
    if (!isValid) {
      console.log('Movimiento inválido:', moveData)
      // Podríamos enviar un mensaje de error al guest
      return
    }
    
    // Aplicar movimiento al estado autoritativo
    applyMove(moveData)
    
    // Broadcast el movimiento aplicado a todos
    broadcastGameUpdate(MESSAGE_TYPES.MOVE_APPLIED, {
      move: moveData,
      newState: {
        board: gameState.value.board,
        currentTurn: gameState.value.currentTurn,
        gameStatus: gameState.value.gameStatus
      }
    })
    
    // Verificar estado del juego después del movimiento
    checkGameStatus()
  }
  
  /**
   * Maneja una solicitud para abandonar asiento
   * @param {string} guestToken - Token del guest
   * @param {Object} data - Datos de la solicitud {color, playerToken}
   */
  function handleLeaveSeat(guestToken, data) {
    const { color } = data
    
    // Verificar que el guest realmente ocupa ese asiento
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
    
    // Terminar juego con el oponente como ganador
    const winner = guestSeatColor === SEAT_COLORS.WHITE ? SEAT_COLORS.BLACK : SEAT_COLORS.WHITE
    endGame(winner, 'surrender')
  }
  
  /**
   * Maneja un mensaje de chat
   * @param {string} guestToken - Token del guest
   * @param {Object} data - Datos del mensaje de chat
   */
  function handleChatMessage(guestToken, data) {
    // Reenviar el mensaje de chat a todos (incluyendo al remitente)
    broadcastGameUpdate(MESSAGE_TYPES.CHAT_MESSAGE, {
      ...data,
      playerToken: guestToken,
      timestamp: Date.now()
    })
  }
  
  /**
   * Valida un movimiento
   * @param {Object} moveData - Datos del movimiento
   * @param {string} playerColor - Color del jugador que hace el movimiento
   * @returns {boolean} true si el movimiento es válido
   */
  function validateMove(moveData, playerColor) {
    const { from, to, piece } = moveData
    
    // Verificar que la pieza sea del color correcto
    if (!isValidMoveForPlayer(board.value, from, to, piece, playerColor)) {
      return false
    }
    
    // Verificar movimiento usando las reglas de ajedrez
    return isValidMove(board.value, from.row, from.col, to.row, to.col, piece)
  }
  
  /**
   * Aplica un movimiento validado al estado autoritativo
   * @param {Object} moveData - Datos del movimiento
   */
  function applyMove(moveData) {
    const { from, to, piece } = moveData
    
    // Aplicar movimiento al tablero
    const newBoard = applyMoveToBoard(board.value, from.row, from.col, to.row, to.col, piece)
    gameState.value.board = newBoard
    
    // Registrar en historial
    const capturedPiece = moveData.captured || ''
    const moveNotation = getAlgebraicNotation(from.row, from.col, to.row, to.col, capturedPiece)
    gameState.value.moveHistory.push({
      ...moveData,
      notation: moveNotation,
      turn: currentTurn.value
    })
    
    // Cambiar turno
    gameState.value.currentTurn = currentTurn.value === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE
  }
  
  /**
   * Libera un asiento
   * @param {string} color - Color del asiento
   * @param {string} playerToken - Token del jugador que libera el asiento
   */
  function vacateSeat(color, playerToken) {
    if (!seats.value[color].occupied || seats.value[color].playerToken !== playerToken) {
      return
    }
    
    // Liberar asiento
    gameState.value.seats[color].occupied = false
    const playerName = gameState.value.seats[color].playerName
    gameState.value.seats[color].playerToken = null
    gameState.value.seats[color].playerName = null
    
    // Agregar a espectadores si no es el host
    if (playerToken !== connectionStore.uuid) {
      addSpectator(playerToken, playerName || `Ex-${color}`)
    }
    
    // Pausar juego si solo queda un jugador
    if (gameStatus.value === GAME_STATUS.PLAYING || gameStatus.value === GAME_STATUS.CHECK) {
      const occupiedCount = (seats.value.white.occupied ? 1 : 0) + (seats.value.black.occupied ? 1 : 0)
      if (occupiedCount === 1) {
        gameState.value.gameStatus = GAME_STATUS.PAUSED
      }
    }
    
    // Broadcast actualización
    broadcastGameUpdate(MESSAGE_TYPES.SEATS_UPDATE, {
      seats: gameState.value.seats,
      changedColor: color,
      playerToken,
      action: 'vacated'
    })
    
    // Si el host libera su asiento, actualizar estado local
    if (playerToken === connectionStore.uuid && hostAsPlayerColor.value === color) {
      hostAsPlayerColor.value = null
      hostSelectedPiece.value = null
      hostValidMoves.value = []
    }
  }
  
  /**
   * Añade un espectador
   * @param {string} token - Token del espectador
   * @param {string} playerName - Nombre del espectador
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
   * @param {string} token - Token del espectador
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
      // Si estaba en jaque pero ya no lo está, volver a 'playing'
      if (!isKingInCheck(board.value, currentColor)) {
        gameState.value.gameStatus = GAME_STATUS.PLAYING
      }
    }
    
    // Broadcast actualización de estado si cambió
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
      // Reanudar juego pausado
      gameState.value.gameStatus = GAME_STATUS.PLAYING
      broadcastGameUpdate(MESSAGE_TYPES.GAME_START_AUTO, {
        timestamp: Date.now(),
        whitePlayer: seats.value.white.playerToken,
        blackPlayer: seats.value.black.playerToken
      })
    }
  }
  
  /**
   * Inicia el juego
   */
  function startGame() {
    gameState.value.gameStatus = GAME_STATUS.PLAYING
    gameState.value.currentTurn = COLORS.WHITE
    
    // Resetear tablero si es un nuevo juego (sin movimientos)
    if (moveHistory.value.length === 0) {
      const initialGameState = createInitialGameState()
      gameState.value.board = initialGameState.board
    }
    
    broadcastGameUpdate(MESSAGE_TYPES.GAME_START, {
      timestamp: Date.now(),
      whitePlayer: seats.value.white.playerToken,
      blackPlayer: seats.value.black.playerToken
    })
  }
  
  /**
   * Termina el juego
   * @param {string|null} winner - Color del ganador (null para empate)
   * @param {string} reason - Razón del fin ('checkmate', 'stalemate', 'surrender', etc.)
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
   * Envía una actualización de juego a todos los subscribers
   * @param {string} type - Tipo de mensaje
   * @param {Object} data - Datos de la actualización
   */
  function broadcastGameUpdate(type, data) {
    if (!connectionStore.isHost || !connectionStore.hasSubscribers) {
      return
    }
    
    const message = formatWebSocketMessage(type, data)
    
    // Usar comando de broadcast explícito
    wsService.broadcast(message).catch(error => {
      console.error('Error enviando broadcast:', error)
    })
  }
  
  /**
   * Obtiene el color del asiento ocupado por un token
   * @param {string} token - Token del jugador
   * @returns {string|null} 'white', 'black', o null
   */
  function getSeatColorByToken(token) {
    if (seats.value.white.playerToken === token) return SEAT_COLORS.WHITE
    if (seats.value.black.playerToken === token) return SEAT_COLORS.BLACK
    return null
  }
  
  // Acciones del host como jugador (cuando ocupa un asiento)
  
  /**
   * El host ocupa un asiento para jugar
   * @param {string} color - Color del asiento a ocupar
   * @returns {boolean} true si el asiento fue ocupado exitosamente
   */
  function occupySeatAsHost(color) {
    if (seats.value[color].occupied) {
      console.log(`Asiento ${color} ya está ocupado`)
      return false
    }
    
    // Si ya está en otro asiento, liberarlo primero
    if (hostAsPlayerColor.value) {
      vacateSeat(hostAsPlayerColor.value, connectionStore.uuid)
    }
    
    // Ocupar asiento
    gameState.value.seats[color].occupied = true
    gameState.value.seats[color].playerToken = connectionStore.uuid
    gameState.value.seats[color].playerName = `Host (${color})`
    hostAsPlayerColor.value = color
    
    // Broadcast actualización
    broadcastGameUpdate(MESSAGE_TYPES.SEATS_UPDATE, {
      seats: gameState.value.seats,
      changedColor: color,
      playerToken: connectionStore.uuid,
      playerName: `Host (${color})`
    })
    
    // Verificar si el juego debe comenzar
    checkAndStartGame()
    
    return true
  }
  
  /**
   * El host selecciona una pieza (cuando juega)
   * @param {Object} position - {row: number, col: number}
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
    
    // Verificar que la pieza sea del color del host
    if (!piece || (hostAsPlayerColor.value === COLORS.WHITE && piece === piece.toLowerCase()) ||
        (hostAsPlayerColor.value === COLORS.BLACK && piece === piece.toUpperCase())) {
      hostSelectedPiece.value = null
      hostValidMoves.value = []
      return
    }
    
    hostSelectedPiece.value = position
    hostValidMoves.value = getValidMoves(board.value, row, col, piece)
  }
  
  /**
   * El host realiza un movimiento (cuando juega)
   * @param {Object} toPosition - Posición de destino {row: number, col: number}
   * @returns {boolean} true si el movimiento fue realizado
   */
  function makeMoveAsHost(toPosition) {
    if (!isHostPlaying.value || !isHostTurn.value || !hostSelectedPiece.value) {
      return false
    }
    
    const { row: fromRow, col: fromCol } = hostSelectedPiece.value
    const { row: toRow, col: toCol } = toPosition
    
    // Verificar que el movimiento sea válido
    const isValidMove = hostValidMoves.value.some(move =>
      move.row === toRow && move.col === toCol
    )
    
    if (!isValidMove) {
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
      playerToken: connectionStore.uuid
    }
    
    // Validar y aplicar el movimiento (como lo haría con cualquier jugador)
    const isValid = validateMove(moveData, hostAsPlayerColor.value)
    if (!isValid) {
      console.log('Movimiento del host no válido según reglas')
      return false
    }
    
    // Aplicar movimiento al estado autoritativo
    applyMove(moveData)
    
    // Broadcast el movimiento aplicado a todos
    broadcastGameUpdate(MESSAGE_TYPES.MOVE_APPLIED, {
      move: moveData,
      newState: {
        board: gameState.value.board,
        currentTurn: gameState.value.currentTurn,
        gameStatus: gameState.value.gameStatus
      }
    })
    
    // Limpiar selección del host
    hostSelectedPiece.value = null
    hostValidMoves.value = []
    
    // Verificar estado del juego
    checkGameStatus()
    
    return true
  }
  
  /**
   * El host abandona su asiento
   */
  function leaveSeatAsHost() {
    if (!isHostPlaying.value) return false
    
    vacateSeat(hostAsPlayerColor.value, connectionStore.uuid)
    return true
  }
  
  /**
   * Reinicia el juego
   */
  function resetGame() {
    initializeGameAsHost()
  }
  
  // Inicializar WebSocket listeners para mensajes directos de guests
  function initWebSocketListeners() {
    // Handler para mensajes directos de guests
    wsService.on('message', (data) => {
      // Solo procesar si somos host
      if (!connectionStore.isHost) return
      
      // El mensaje viene con 'from' y 'message'
      const { from, message } = data
      handleGuestMessage(from, message)
    })
    
    // Handler para nuevos subscribers (guests que se conectan)
    wsService.on('new_subscriber', (data) => {
      if (!connectionStore.isHost) return
      
      const { guest } = data
      // Podríamos enviar el estado actual al nuevo subscriber
      // Por ahora solo lo agregamos como espectador
      addSpectator(guest, `Guest`)
    })
    
    // Handler para subscribers desconectados
    wsService.on('subscriber_disconnected', (data) => {
      if (!connectionStore.isHost) return
      
      const { guest } = data
      // Verificar si el guest estaba en un asiento
      const seatColor = getSeatColorByToken(guest)
      if (seatColor) {
        vacateSeat(seatColor, guest)
      } else {
        removeSpectator(guest)
      }
    })
  }
  
  // Inicializar al crear el store
  initializeGameAsHost()
  initWebSocketListeners()
  
  return {
    // Estado autoritativo (getters)
    board,
    currentTurn,
    gameStatus,
    moveHistory,
    seats,
    spectators,
    
    // Estado del host como jugador
    hostAsPlayerColor,
    hostSelectedPiece,
    hostValidMoves,
    
    // Getters
    isHostPlaying,
    isHostTurn,
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
    
    // Acciones del host como jugador
    occupySeatAsHost,
    selectPieceAsHost,
    makeMoveAsHost,
    leaveSeatAsHost,
    
    // Funciones de utilidad
    getSeatColorByToken
  }
})