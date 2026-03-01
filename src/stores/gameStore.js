import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useConnectionStore } from './connectionStore'
import { getWebSocketService } from '@/services/WebSocketService'
import {
  createInitialBoard as createInitialBoardUtil,
  getValidMoves,
  isValidMove,
  applyMove,
  isKingInCheck,
  isCheckmate,
  isStalemate,
  coordinatesToAlgebraic,
  COLORS
} from '@/utils/chessRules'

export const useGameStore = defineStore('game', () => {
  // Estado del juego
  const board = ref(createInitialBoardUtil())
  const currentTurn = ref(COLORS.WHITE) // 'white' o 'black'
  const selectedPiece = ref(null) // {row, col} o null
  const validMoves = ref([]) // Array de {row, col}
  const gameStatus = ref('waiting') // 'waiting', 'playing', 'check', 'checkmate', 'stalemate', 'finished', 'paused'
  const moveHistory = ref([])
  const playerColor = ref(COLORS.WHITE) // Color del jugador local
  const isHost = ref(false)
  
  // Nuevo estado: Sistema de asientos
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

  // Inicializar el tablero (usando la utilidad)
  function createInitialBoard() {
    return createInitialBoardUtil()
  }

  // Getters
  const isMyTurn = computed(() => {
    return currentTurn.value === playerColor.value
  })

  const winner = computed(() => {
    if (gameStatus.value === 'checkmate') {
      return currentTurn.value === 'white' ? 'black' : 'white'
    }
    return null
  })

  const boardState = computed(() => {
    return board.value.map(row => [...row])
  })
  
  // Nuevos getters para sistema de asientos
  const isSeated = computed(() => {
    return seats.value.white.playerToken === connectionStore.uuid ||
           seats.value.black.playerToken === connectionStore.uuid
  })
  
  const mySeatColor = computed(() => {
    if (seats.value.white.playerToken === connectionStore.uuid) return 'white'
    if (seats.value.black.playerToken === connectionStore.uuid) return 'black'
    return null
  })
  
  const isSpectator = computed(() => {
    return !isSeated.value && spectators.value.includes(connectionStore.uuid)
  })
  
  const bothSeatsOccupied = computed(() => {
    return seats.value.white.occupied && seats.value.black.occupied
  })
  
  const availableSeats = computed(() => {
    const available = []
    if (!seats.value.white.occupied) available.push('white')
    if (!seats.value.black.occupied) available.push('black')
    return available
  })
  
  const spectatorsCount = computed(() => spectators.value.length)

  // Acciones
  function selectPiece(position) {
    if (gameStatus.value !== 'playing' && gameStatus.value !== 'check') {
      return
    }

    if (!isMyTurn.value) {
      console.log('No es tu turno')
      return
    }

    const { row, col } = position
    const piece = board.value[row][col]
    
    // Verificar que la pieza sea del color del jugador
    if (!piece || (playerColor.value === 'white' && piece === piece.toLowerCase()) ||
        (playerColor.value === 'black' && piece === piece.toUpperCase())) {
      selectedPiece.value = null
      validMoves.value = []
      return
    }

    selectedPiece.value = position
    // TODO: Calcular movimientos válidos usando chessRules
    validMoves.value = calculateValidMoves(position, piece)
  }

  function calculateValidMoves(position, piece) {
    const { row, col } = position
    // Usar las reglas reales de ajedrez
    return getValidMoves(board.value, row, col, piece)
  }

  function movePiece(toPosition) {
    if (!selectedPiece.value || gameStatus.value !== 'playing' && gameStatus.value !== 'check') {
      return false
    }

    const { row: fromRow, col: fromCol } = selectedPiece.value
    const { row: toRow, col: toCol } = toPosition
    
    // Verificar que el movimiento sea válido
    const isValidMove = validMoves.value.some(move => 
      move.row === toRow && move.col === toCol
    )
    
    if (!isValidMove) {
      console.log('Movimiento inválido')
      return false
    }

    // Realizar movimiento localmente
    const piece = board.value[fromRow][fromCol]
    const capturedPiece = board.value[toRow][toCol]
    
    board.value[toRow][toCol] = piece
    board.value[fromRow][fromCol] = ''
    
    // Registrar en historial
    const moveNotation = getAlgebraicNotation(fromRow, fromCol, toRow, toCol, capturedPiece)
    moveHistory.value.push({
      from: { row: fromRow, col: fromCol },
      to: { row: toRow, col: toCol },
      piece,
      captured: capturedPiece,
      notation: moveNotation,
      turn: currentTurn.value
    })
    
    // Cambiar turno
    currentTurn.value = currentTurn.value === 'white' ? 'black' : 'white'
    
    // Limpiar selección
    selectedPiece.value = null
    validMoves.value = []
    
    // Enviar movimiento al oponente según el modo
    if (connectionStore.isConnected) {
      const moveData = {
        from: { row: fromRow, col: fromCol },
        to: { row: toRow, col: toCol },
        piece,
        timestamp: Date.now()
      }
      
      if (isHost.value) {
        // Host envía broadcast a todos los subscribers
        wsService.sendGameMessage(
          connectionStore.shortToken, // Enviar a sí mismo para broadcast
          'MOVE',
          moveData
        ).catch(error => {
          console.error('Error enviando movimiento (broadcast):', error)
        })
      } else if (connectionStore.isGuest && connectionStore.subscribedHost) {
        // Guest envía mensaje directo al host
        wsService.sendGameMessage(
          connectionStore.subscribedHost,
          'MOVE',
          moveData
        ).catch(error => {
          console.error('Error enviando movimiento (directo):', error)
        })
      }
    }
    
    // Verificar estado del juego
    checkGameStatus()
    
    return true
  }

  function applyRemoteMove(moveData) {
    const { from, to, piece } = moveData
    
    // Aplicar movimiento
    board.value[to.row][to.col] = piece
    board.value[from.row][from.col] = ''
    
    // Registrar en historial
    const capturedPiece = board.value[to.row][to.col] // Ya debería estar vacío
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
    
    // Cambiar turno
    currentTurn.value = currentTurn.value === 'white' ? 'black' : 'white'
    
    // Verificar estado del juego
    checkGameStatus()
  }

  function getAlgebraicNotation(fromRow, fromCol, toRow, toCol, capturedPiece) {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1']
    
    const fromFile = files[fromCol]
    const fromRank = ranks[fromRow]
    const toFile = files[toCol]
    const toRank = ranks[toRow]
    
    return `${fromFile}${fromRank}${capturedPiece ? 'x' : ''}${toFile}${toRank}`
  }

  function checkGameStatus() {
    // Verificar estado del juego usando las reglas reales
    const currentColor = currentTurn.value
    
    if (isCheckmate(board.value, currentColor)) {
      gameStatus.value = 'checkmate'
    } else if (isStalemate(board.value, currentColor)) {
      gameStatus.value = 'stalemate'
    } else if (isKingInCheck(board.value, currentColor)) {
      gameStatus.value = 'check'
    } else if (gameStatus.value === 'waiting') {
      gameStatus.value = 'playing'
    } else if (gameStatus.value === 'check' || gameStatus.value === 'playing') {
      // Si estaba en jaque pero ya no lo está, volver a 'playing'
      if (!isKingInCheck(board.value, currentColor)) {
        gameStatus.value = 'playing'
      }
    }
  }

  function startGame(asHost = false, color = 'white') {
    isHost.value = asHost
    playerColor.value = color
    gameStatus.value = 'playing'
    currentTurn.value = 'white' // Las blancas siempre empiezan
    
    // Resetear tablero
    board.value = createInitialBoard()
    selectedPiece.value = null
    validMoves.value = []
    moveHistory.value = []
    
    // Si es host, notificar a todos los guests via broadcast
    if (asHost && connectionStore.isHost && connectionStore.hasSubscribers) {
      const gameStartData = {
        color: color === 'white' ? 'black' : 'white', // El oponente tiene el color opuesto
        timestamp: Date.now(),
        isHost: false
      }
      
      // Enviar broadcast a todos los subscribers
      // En el nuevo protocolo, cuando un host envía un mensaje a su propio token,
      // se envía como broadcast a todos sus subscribers
      wsService.sendGameMessage(
        connectionStore.shortToken, // Enviar a sí mismo para broadcast
        'GAME_START',
        gameStartData
      )
    }
  }

  function joinGame(color = 'black') {
    playerColor.value = color
    gameStatus.value = 'playing'
    isHost.value = false
  }

  function resetGame() {
    board.value = createInitialBoard()
    currentTurn.value = 'white'
    selectedPiece.value = null
    validMoves.value = []
    gameStatus.value = 'waiting'
    moveHistory.value = []
    playerColor.value = 'white'
    isHost.value = false
    
    // Resetear asientos
    seats.value.white.occupied = false
    seats.value.white.playerToken = null
    seats.value.white.playerName = null
    seats.value.black.occupied = false
    seats.value.black.playerToken = null
    seats.value.black.playerName = null
    
    // Limpiar espectadores
    spectators.value = []
  }

  function surrender() {
    gameStatus.value = 'finished'
    // TODO: Notificar al oponente
  }

  // Acciones para sistema de asientos
  function occupySeat(color, playerToken, playerName = null) {
    if (seats.value[color].occupied) {
      console.log(`Asiento ${color} ya está ocupado`)
      return false
    }
    
    // Si el jugador ya está en otro asiento, liberarlo primero
    if (seats.value.white.playerToken === playerToken) {
      vacateSeat('white', false)
    } else if (seats.value.black.playerToken === playerToken) {
      vacateSeat('black', false)
    }
    
    // Remover de espectadores si está allí
    removeSpectator(playerToken, false)
    
    // Ocupar asiento
    seats.value[color].occupied = true
    seats.value[color].playerToken = playerToken
    seats.value[color].playerName = playerName || `Jugador ${color}`
    
    // Si el jugador es local, actualizar playerColor
    if (playerToken === connectionStore.uuid) {
      playerColor.value = color
    }
    
    // Verificar si el juego debe comenzar o reanudarse
    checkGameStart()
    
    // Notificar a otros jugadores via WebSocket
    if (connectionStore.isConnected) {
      const seatData = {
        color,
        playerToken,
        playerName: playerName || `Jugador ${color}`,
        timestamp: Date.now()
      }
      
      if (isHost.value) {
        wsService.sendGameMessage(
          connectionStore.shortToken,
          'SEAT_OCCUPIED',
          seatData
        ).catch(error => {
          console.error('Error enviando ocupación de asiento:', error)
        })
      } else if (connectionStore.isGuest && connectionStore.subscribedHost) {
        wsService.sendGameMessage(
          connectionStore.subscribedHost,
          'SEAT_OCCUPIED',
          seatData
        ).catch(error => {
          console.error('Error enviando ocupación de asiento:', error)
        })
      }
    }
    
    return true
  }
  
  function vacateSeat(color, notifyOthers = true) {
    if (!seats.value[color].occupied) {
      console.log(`Asiento ${color} ya está vacío`)
      return false
    }
    
    const playerToken = seats.value[color].playerToken
    
    // Liberar asiento
    seats.value[color].occupied = false
    seats.value[color].playerToken = null
    seats.value[color].playerName = null
    
    // Agregar a espectadores si el jugador no se desconectó
    if (playerToken && playerToken !== connectionStore.uuid) {
      addSpectator(playerToken, `Ex-${color}`, false)
    }
    
    // Pausar juego si solo queda un jugador
    if (gameStatus.value === 'playing' || gameStatus.value === 'check') {
      const occupiedCount = (seats.value.white.occupied ? 1 : 0) + (seats.value.black.occupied ? 1 : 0)
      if (occupiedCount === 1) {
        gameStatus.value = 'paused'
      }
    }
    
    // Notificar a otros jugadores via WebSocket
    if (notifyOthers && connectionStore.isConnected) {
      const seatData = {
        color,
        playerToken,
        timestamp: Date.now()
      }
      
      if (isHost.value) {
        wsService.sendGameMessage(
          connectionStore.shortToken,
          'SEAT_VACATED',
          seatData
        ).catch(error => {
          console.error('Error enviando liberación de asiento:', error)
        })
      } else if (connectionStore.isGuest && connectionStore.subscribedHost) {
        wsService.sendGameMessage(
          connectionStore.subscribedHost,
          'SEAT_VACATED',
          seatData
        ).catch(error => {
          console.error('Error enviando liberación de asiento:', error)
        })
      }
    }
    
    return true
  }
  
  function addSpectator(token, playerName = null, notifyOthers = true) {
    if (!spectators.value.includes(token)) {
      spectators.value.push(token)
      
      // Notificar a otros jugadores via WebSocket
      if (notifyOthers && connectionStore.isConnected) {
        const spectatorData = {
          token,
          playerName: playerName || `Espectador`,
          timestamp: Date.now()
        }
        
        if (isHost.value) {
          wsService.sendGameMessage(
            connectionStore.shortToken,
            'SPECTATOR_JOINED',
            spectatorData
          ).catch(error => {
            console.error('Error enviando unión de espectador:', error)
          })
        }
      }
    }
  }
  
  function removeSpectator(token, notifyOthers = true) {
    const index = spectators.value.indexOf(token)
    if (index !== -1) {
      spectators.value.splice(index, 1)
      
      // Notificar a otros jugadores via WebSocket
      if (notifyOthers && connectionStore.isConnected) {
        const spectatorData = {
          token,
          timestamp: Date.now()
        }
        
        if (isHost.value) {
          wsService.sendGameMessage(
            connectionStore.shortToken,
            'SPECTATOR_LEFT',
            spectatorData
          ).catch(error => {
            console.error('Error enviando salida de espectador:', error)
          })
        }
      }
    }
  }
  
  function checkGameStart() {
    // Si ambos asientos están ocupados y el juego no ha comenzado, iniciar
    if (bothSeatsOccupied.value && (gameStatus.value === 'waiting' || gameStatus.value === 'paused')) {
      startGameAutomatically()
    }
  }
  
  function startGameAutomatically() {
    gameStatus.value = 'playing'
    currentTurn.value = 'white' // Las blancas siempre empiezan
    
    // Resetear tablero si es un nuevo juego
    if (moveHistory.value.length === 0) {
      board.value = createInitialBoard()
    }
    
    selectedPiece.value = null
    validMoves.value = []
    
    // Notificar a todos los jugadores
    if (connectionStore.isConnected) {
      const gameStartData = {
        timestamp: Date.now(),
        whitePlayer: seats.value.white.playerToken,
        blackPlayer: seats.value.black.playerToken
      }
      
      if (isHost.value) {
        wsService.sendGameMessage(
          connectionStore.shortToken,
          'GAME_START_AUTO',
          gameStartData
        ).catch(error => {
          console.error('Error enviando inicio automático de juego:', error)
        })
      }
    }
  }
  
  function leaveSeat() {
    if (mySeatColor.value) {
      return vacateSeat(mySeatColor.value)
    }
    return false
  }
  
  function takeSeat(color) {
    if (!connectionStore.uuid) {
      console.log('No hay UUID para ocupar asiento')
      return false
    }
    
    return occupySeat(color, connectionStore.uuid, connectionStore.shortToken)
  }

  // Inicializar listeners para mensajes WebSocket
  function initWebSocketListeners() {
    // Handler para mensajes broadcast (del host)
    wsService.on('broadcast_message', (data) => {
      console.log('Mensaje broadcast recibido:', data)
      
      // Parsear el mensaje
      const [type, jsonData] = data.message.split('|')
      const parsedData = JSON.parse(jsonData)
      
      switch (type) {
        case 'GAME_START':
          console.log('Juego iniciado por host:', parsedData)
          joinGame(parsedData.color)
          break
          
        case 'GAME_START_AUTO':
          console.log('Juego iniciado automáticamente:', parsedData)
          gameStatus.value = 'playing'
          currentTurn.value = 'white'
          break
          
        case 'MOVE':
          console.log('Movimiento remoto recibido del host:', parsedData)
          applyRemoteMove(parsedData)
          break
          
        case 'GAME_END':
          console.log('Juego terminado:', parsedData)
          gameStatus.value = 'finished'
          // TODO: Mostrar resultado
          break
          
        case 'SEAT_OCCUPIED':
          console.log('Asiento ocupado recibido:', parsedData)
          // Actualizar estado local del asiento
          seats.value[parsedData.color].occupied = true
          seats.value[parsedData.color].playerToken = parsedData.playerToken
          seats.value[parsedData.color].playerName = parsedData.playerName
          
          // Si soy el jugador que ocupó el asiento, actualizar mi color
          if (parsedData.playerToken === connectionStore.uuid) {
            playerColor.value = parsedData.color
          }
          
          // Verificar si el juego debe comenzar
          checkGameStart()
          break
          
        case 'SEAT_VACATED':
          console.log('Asiento liberado recibido:', parsedData)
          // Liberar asiento
          seats.value[parsedData.color].occupied = false
          seats.value[parsedData.color].playerToken = null
          seats.value[parsedData.color].playerName = null
          
          // Pausar juego si solo queda un jugador
          if (gameStatus.value === 'playing' || gameStatus.value === 'check') {
            const occupiedCount = (seats.value.white.occupied ? 1 : 0) + (seats.value.black.occupied ? 1 : 0)
            if (occupiedCount === 1) {
              gameStatus.value = 'paused'
            }
          }
          break
          
        case 'SPECTATOR_JOINED':
          console.log('Espectador unido:', parsedData)
          if (!spectators.value.includes(parsedData.token)) {
            spectators.value.push(parsedData.token)
          }
          break
          
        case 'SPECTATOR_LEFT':
          console.log('Espectador salió:', parsedData)
          const index = spectators.value.indexOf(parsedData.token)
          if (index !== -1) {
            spectators.value.splice(index, 1)
          }
          break
          
        default:
          console.log('Tipo de mensaje broadcast no reconocido:', type)
      }
    })
    
    // Handler para mensajes directos (del guest al host)
    wsService.on('message', (data) => {
      console.log('Mensaje directo recibido:', data)
      
      // Parsear el mensaje
      const [type, jsonData] = data.message.split('|')
      const parsedData = JSON.parse(jsonData)
      
      switch (type) {
        case 'MOVE':
          console.log('Movimiento remoto recibido del guest:', parsedData)
          applyRemoteMove(parsedData)
          break
          
        default:
          console.log('Tipo de mensaje directo no reconocido:', type)
      }
    })
    
    // Handler para desconexión del host
    wsService.on('host_disconnected', (data) => {
      console.log('Host desconectado:', data)
      if (!isHost.value) {
        gameStatus.value = 'finished'
        // TODO: Mostrar mensaje de desconexión
      }
    })
  }

  // Inicializar listeners al crear el store
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
    isHost,
    seats,
    spectators,
    
    // Getters
    isMyTurn,
    winner,
    boardState,
    isSeated,
    mySeatColor,
    isSpectator,
    bothSeatsOccupied,
    availableSeats,
    spectatorsCount,
    
    // Acciones
    selectPiece,
    movePiece,
    applyRemoteMove,
    startGame,
    joinGame,
    resetGame,
    surrender,
    occupySeat,
    vacateSeat,
    addSpectator,
    removeSpectator,
    leaveSeat,
    takeSeat
  }
})