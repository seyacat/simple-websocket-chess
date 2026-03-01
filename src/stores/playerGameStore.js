// Store para la lógica del jugador/guest
// Maneja la vista local del juego, interacción de UI y comunicación con el host

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useConnectionStore } from './connectionStore'
import { getWebSocketService } from '@/services/WebSocketService'
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
  createInitialGameState
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
  
  // Sistema de asientos (vista local)
  const seats = ref({
    white: {
      occupied: false,
      playerToken: null,
      playerName: null
    },
    black: {
      occupied: false,
      playerToken: null,
      playerName: null
    }
  })
  
  const spectators = ref([]) // Array de tokens de espectadores
  
  // Stores y servicios
  const connectionStore = useConnectionStore()
  const wsService = getWebSocketService()
  
  // Inicializar el tablero
  function initializeBoard() {
    const initialGameState = createInitialGameState()
    board.value = initialGameState.board
    currentTurn.value = initialGameState.currentTurn
    gameStatus.value = initialGameState.gameStatus
    moveHistory.value = initialGameState.moveHistory
    seats.value = initialGameState.seats
    spectators.value = initialGameState.spectators
    playerColor.value = COLORS.WHITE // Reset player color to default
    selectedPiece.value = null // Clear any selected piece
    validMoves.value = [] // Clear valid moves
  }
  
  // Getters
  const isMyTurn = computed(() => {
    return currentTurn.value === playerColor.value
  })
  
  const winner = computed(() => {
    if (gameStatus.value === GAME_STATUS.CHECKMATE) {
      return currentTurn.value === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE
    }
    return null
  })
  
  const boardState = computed(() => {
    return board.value.map(row => [...row])
  })
  
  const isSeated = computed(() => {
    return seats.value.white.playerToken === connectionStore.uuid ||
           seats.value.black.playerToken === connectionStore.uuid
  })
  
  const mySeatColor = computed(() => {
    if (seats.value.white.playerToken === connectionStore.uuid) return SEAT_COLORS.WHITE
    if (seats.value.black.playerToken === connectionStore.uuid) return SEAT_COLORS.BLACK
    return null
  })
  
  const isSpectator = computed(() => {
    return !isSeated.value && spectators.value.includes(connectionStore.uuid)
  })
  
  // Indica si el host al que estamos suscritos tiene una instancia activa
  const hostInstanceActive = computed(() => {
    // El host tiene instancia activa si estamos suscritos y recibimos broadcast
    // Para simplificar, asumimos que si estamos suscritos, el host está activo
    // En realidad deberíamos verificar si hemos recibido mensajes recientemente
    return connectionStore.isSubscribed
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
  
  // Acciones del jugador
  
  /**
   * Selecciona una pieza en el tablero
   * @param {Object} position - {row: number, col: number}
   */
  function selectPiece(position) {
    if (gameStatus.value !== GAME_STATUS.PLAYING && gameStatus.value !== GAME_STATUS.CHECK) {
      return
    }
    
    if (!isMyTurn.value) {
      console.log('No es tu turno')
      return
    }
    
    const { row, col } = position
    const piece = board.value[row][col]
    
    // Verificar que la pieza sea del color del jugador
    if (!piece || (playerColor.value === COLORS.WHITE && piece === piece.toLowerCase()) ||
        (playerColor.value === COLORS.BLACK && piece === piece.toUpperCase())) {
      selectedPiece.value = null
      validMoves.value = []
      return
    }
    
    selectedPiece.value = position
    validMoves.value = calculateValidMoves(position, piece)
  }
  
  /**
   * Calcula los movimientos válidos para una pieza
   * @param {Object} position - {row: number, col: number}
   * @param {string} piece - Pieza en esa posición
   * @returns {Array} Lista de posiciones válidas {row, col}
   */
  function calculateValidMoves(position, piece) {
    const { row, col } = position
    return getValidMoves(board.value, row, col, piece)
  }
  
  /**
   * Realiza un movimiento local y lo envía al host para validación
   * @param {Object} toPosition - Posición de destino {row: number, col: number}
   * @returns {boolean} true si el movimiento fue enviado al host
   */
  function makeMove(toPosition) {
    if (!selectedPiece.value || 
        (gameStatus.value !== GAME_STATUS.PLAYING && gameStatus.value !== GAME_STATUS.CHECK)) {
      return false
    }
    
    const { row: fromRow, col: fromCol } = selectedPiece.value
    const { row: toRow, col: toCol } = toPosition
    
    // Verificar que el movimiento sea válido localmente
    const isValidMove = validMoves.value.some(move => 
      move.row === toRow && move.col === toCol
    )
    
    if (!isValidMove) {
      console.log('Movimiento inválido')
      return false
    }
    
    // Obtener la pieza que se mueve
    const piece = board.value[fromRow][fromCol]
    const capturedPiece = board.value[toRow][toCol]
    
    // Crear datos del movimiento
    const moveData = {
      from: { row: fromRow, col: fromCol },
      to: { row: toRow, col: toCol },
      piece,
      captured: capturedPiece,
      timestamp: Date.now(),
      playerToken: connectionStore.uuid
    }
    
    // Enviar movimiento al host para validación
    sendMoveToHost(moveData)
    
    // Limpiar selección local
    selectedPiece.value = null
    validMoves.value = []
    
    return true
  }
  
  /**
   * Envía un movimiento al host para validación
   * @param {Object} moveData - Datos del movimiento
   */
  function sendMoveToHost(moveData) {
    if (!connectionStore.isConnected || !connectionStore.subscribedHost) {
      console.error('No hay conexión o no estás suscrito a un host')
      return
    }
    
    const message = formatWebSocketMessage(MESSAGE_TYPES.MOVE, moveData)
    
    wsService.sendMessage(
      connectionStore.subscribedHost,
      message
    ).catch(error => {
      console.error('Error enviando movimiento al host:', error)
    })
  }
  
  /**
   * Aplica un movimiento recibido del host (validado)
   * @param {Object} moveData - Datos del movimiento validado
   */
  function applyMoveFromHost(moveData) {
    const { from, to, piece } = moveData
    
    // Aplicar movimiento localmente
    board.value[to.row][to.col] = piece
    board.value[from.row][from.col] = ''
    
    // Registrar en historial
    const capturedPiece = moveData.captured || ''
    const moveNotation = getAlgebraicNotation(from.row, from.col, to.row, to.col, capturedPiece)
    moveHistory.value.push({
      from,
      to,
      piece,
      captured: capturedPiece,
      notation: moveNotation,
      turn: currentTurn.value,
      isRemote: true
    })
    
    // Cambiar turno local
    currentTurn.value = currentTurn.value === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE
    
    // Limpiar selección si está seleccionada la pieza que se movió
    if (selectedPiece.value && 
        selectedPiece.value.row === from.row && 
        selectedPiece.value.col === from.col) {
      selectedPiece.value = null
      validMoves.value = []
    }
    
    // Verificar estado del juego (esto debería venir del host, pero lo calculamos localmente también)
    checkLocalGameStatus()
  }
  
  /**
   * Verifica el estado local del juego
   */
  function checkLocalGameStatus() {
    // Nota: En la implementación completa, el estado del juego
    // debería venir del host. Esto es solo para UI local.
    // Por ahora mantenemos la lógica simple
    if (gameStatus.value === GAME_STATUS.WAITING && bothSeatsOccupied.value) {
      gameStatus.value = GAME_STATUS.PLAYING
    }
  }
  
  /**
   * Solicita ocupar un asiento al host
   * @param {string} color - 'white' o 'black'
   * @returns {boolean} true si la solicitud fue enviada
   */
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
      playerToken: connectionStore.uuid,
      playerName: connectionStore.shortToken || `Jugador ${color}`,
      timestamp: Date.now()
    }
    
    const message = formatWebSocketMessage(MESSAGE_TYPES.SEAT_REQUEST, seatRequestData)
    
    wsService.sendMessage(
      connectionStore.subscribedHost,
      message
    ).catch(error => {
      console.error('Error solicitando asiento:', error)
    })
    
    return true
  }
  
  /**
   * Solicita abandonar el asiento actual al host
   * @returns {boolean} true si la solicitud fue enviada
   */
  function requestLeaveSeat() {
    if (!isSeated.value || !connectionStore.subscribedHost) {
      return false
    }
    
    const leaveSeatData = {
      color: mySeatColor.value,
      playerToken: connectionStore.uuid,
      timestamp: Date.now()
    }
    
    const message = formatWebSocketMessage(MESSAGE_TYPES.LEAVE_SEAT, leaveSeatData)
    
    wsService.sendMessage(
      connectionStore.subscribedHost,
      message
    ).catch(error => {
      console.error('Error solicitando salir del asiento:', error)
    })
    
    return true
  }
  
  /**
   * Aplica una actualización de estado recibida del host
   * @param {string} type - Tipo de actualización
   * @param {Object} data - Datos de la actualización
   */
  function applyUpdateFromHost(type, data) {
    switch (type) {
      case MESSAGE_TYPES.GAME_STATE_UPDATE:
        applyFullGameStateUpdate(data)
        break
        
      case MESSAGE_TYPES.MOVE_APPLIED:
        applyMoveFromHost(data.move)
        break
        
      case MESSAGE_TYPES.SEATS_UPDATE:
        applySeatsUpdate(data)
        break
        
      case MESSAGE_TYPES.GAME_START:
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
  
  /**
   * Aplica una actualización completa del estado del juego
   * @param {Object} gameState - Estado completo del juego
   */
  function applyFullGameStateUpdate(gameState) {
    if (gameState.board) board.value = gameState.board
    if (gameState.currentTurn) currentTurn.value = gameState.currentTurn
    if (gameState.gameStatus) gameStatus.value = gameState.gameStatus
    if (gameState.moveHistory) moveHistory.value = gameState.moveHistory
    if (gameState.seats) seats.value = gameState.seats
    if (gameState.spectators) spectators.value = gameState.spectators
  }
  
  /**
   * Aplica una actualización de asientos
   * @param {Object} seatsUpdate - Datos de actualización de asientos
   */
  function applySeatsUpdate(seatsUpdate) {
    if (seatsUpdate.seats) {
      seats.value = seatsUpdate.seats
    }
    
    // Actualizar playerColor si soy yo quien ocupó/liberó el asiento
    if (seatsUpdate.changedColor && seatsUpdate.playerToken === connectionStore.uuid) {
      if (seats.value[seatsUpdate.changedColor].playerToken === connectionStore.uuid) {
        playerColor.value = seatsUpdate.changedColor
      } else if (mySeatColor.value === seatsUpdate.changedColor) {
        // Liberamos nuestro asiento
        playerColor.value = COLORS.WHITE // Reset a valor por defecto
      }
    }
  }
  
  /**
   * Aplica inicio de juego
   * @param {Object} gameStartData - Datos de inicio de juego
   */
  function applyGameStart(gameStartData) {
    gameStatus.value = GAME_STATUS.PLAYING
    currentTurn.value = COLORS.WHITE
    
    // Si se especifica color para este jugador
    if (gameStartData.color && gameStartData.playerToken === connectionStore.uuid) {
      playerColor.value = gameStartData.color
    }
  }
  
  /**
   * Aplica fin de juego
   * @param {Object} gameEndData - Datos de fin de juego
   */
  function applyGameEnd(gameEndData) {
    // Cuando el juego termina (especialmente si el host lo cierra),
    // resetear completamente el estado local
    console.log('Juego terminado, reseteando estado local. Razón:', gameEndData?.reason || 'desconocida')
    initializeBoard()
    
    // Si el host cerró el juego, también podríamos mostrar un mensaje
    if (gameEndData?.reason === 'host_closed_game') {
      console.log('El host cerró el juego')
    }
  }
  
  /**
   * Aplica unión de espectador
   * @param {Object} spectatorData - Datos del espectador
   */
  function applySpectatorJoined(spectatorData) {
    if (!spectators.value.includes(spectatorData.token)) {
      spectators.value.push(spectatorData.token)
    }
  }
  
  /**
   * Aplica salida de espectador
   * @param {Object} spectatorData - Datos del espectador
   */
  function applySpectatorLeft(spectatorData) {
    const index = spectators.value.indexOf(spectatorData.token)
    if (index !== -1) {
      spectators.value.splice(index, 1)
    }
  }
  
  /**
   * Reinicia el estado local del juego
   */
  function resetLocalGame() {
    initializeBoard()
    selectedPiece.value = null
    validMoves.value = []
    playerColor.value = COLORS.WHITE
  }
  
  /**
   * Rinde la partida
   */
  function surrender() {
    if (!connectionStore.subscribedHost) return
    
    const surrenderData = {
      playerToken: connectionStore.uuid,
      timestamp: Date.now()
    }
    
    const message = formatWebSocketMessage(MESSAGE_TYPES.SURRENDER, surrenderData)
    
    wsService.sendMessage(
      connectionStore.subscribedHost,
      message
    ).catch(error => {
      console.error('Error enviando rendición:', error)
    })
  }
  
  // Inicializar WebSocket listeners
  function initWebSocketListeners() {
    // Handler para mensajes broadcast del host
    wsService.on('broadcast_message', (data) => {
      const parsed = parseWebSocketMessage(data.message)
      applyUpdateFromHost(parsed.type, parsed.data)
    })
    
    // Handler para desconexión del host
    wsService.on('host_disconnected', (data) => {
      // Cuando el host se desconecta o cierra el juego, resetear completamente el estado local
      console.log('Host desconectado, reseteando estado local del juego. Razón:', data?.reason || 'desconocida')
      initializeBoard()
      
      // También podríamos mostrar un mensaje al usuario basado en la razón
      if (data?.reason === 'closed_game') {
        console.log('El host cerró el juego intencionalmente')
      } else if (data?.reason === 'changed_mode') {
        console.log('El host cambió de modo')
      }
    })
  }
  
  // Inicializar al crear el store
  initializeBoard()
  initWebSocketListeners()
  
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
    resetLocalGame,
    surrender,
    initializeBoard
  }
})