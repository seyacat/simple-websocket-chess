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
  const gameStatus = ref('waiting') // 'waiting', 'playing', 'check', 'checkmate', 'stalemate', 'finished'
  const moveHistory = ref([])
  const playerColor = ref(COLORS.WHITE) // Color del jugador local
  const isHost = ref(false)
  
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
    
    // Enviar movimiento al oponente si estamos conectados
    if (connectionStore.canPlay && connectionStore.opponentToken) {
      const moveData = {
        from: { row: fromRow, col: fromCol },
        to: { row: toRow, col: toCol },
        piece,
        timestamp: Date.now()
      }
      
      wsService.sendGameMessage(
        connectionStore.opponentToken,
        'MOVE',
        moveData
      ).catch(error => {
        console.error('Error enviando movimiento:', error)
      })
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
    
    // Si es host, notificar al guest
    if (asHost && connectionStore.canPlay && connectionStore.opponentToken) {
      const gameStartData = {
        color: color === 'white' ? 'black' : 'white', // El oponente tiene el color opuesto
        timestamp: Date.now(),
        isHost: false
      }
      
      wsService.sendGameMessage(
        connectionStore.opponentToken,
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
  }

  function surrender() {
    gameStatus.value = 'finished'
    // TODO: Notificar al oponente
  }

  // Inicializar listeners para mensajes WebSocket
  function initWebSocketListeners() {
    wsService.on('MOVE', (data) => {
      console.log('Movimiento remoto recibido:', data)
      applyRemoteMove(data)
    })
    
    wsService.on('GAME_START', (data) => {
      console.log('Juego iniciado por host:', data)
      joinGame(data.color)
    })
    
    wsService.on('GAME_END', (data) => {
      console.log('Juego terminado:', data)
      gameStatus.value = 'finished'
      // TODO: Mostrar resultado
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
    
    // Getters
    isMyTurn,
    winner,
    boardState,
    
    // Acciones
    selectPiece,
    movePiece,
    applyRemoteMove,
    startGame,
    joinGame,
    resetGame,
    surrender
  }
})