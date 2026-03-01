// Adaptador para mantener compatibilidad con código existente
// mientras se migra a los nuevos stores separados (hostGameStore y playerGameStore)

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useConnectionStore } from './connectionStore'
import { useHostGameStore } from './hostGameStore'
import { usePlayerGameStore } from './playerGameStore'

export const useGameStore = defineStore('game', () => {
  const connectionStore = useConnectionStore()
  const hostGameStore = useHostGameStore()
  const playerGameStore = usePlayerGameStore()
  
  // Determinar qué store usar basado en el modo
  const isHost = computed(() => connectionStore.isHost)
  const activeStore = computed(() => isHost.value ? hostGameStore : playerGameStore)
  
  // Estado (proxy al store activo)
  const board = computed(() => activeStore.value.board)
  const currentTurn = computed(() => activeStore.value.currentTurn)
  const selectedPiece = computed(() => activeStore.value.selectedPiece)
  const validMoves = computed(() => activeStore.value.validMoves)
  const gameStatus = computed(() => activeStore.value.gameStatus)
  const moveHistory = computed(() => activeStore.value.moveHistory)
  const playerColor = computed(() => activeStore.value.playerColor)
  const seats = computed(() => activeStore.value.seats)
  const spectators = computed(() => activeStore.value.spectators)
  
  // Mantener isHost por compatibilidad
  const isHostRef = ref(false)
  
  // Getters (proxy al store activo o lógica combinada)
  const isMyTurn = computed(() => {
    if (isHost.value) {
      return hostGameStore.isHostTurn
    } else {
      return playerGameStore.isMyTurn
    }
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
  
  const isSeated = computed(() => {
    if (isHost.value) {
      return hostGameStore.isHostPlaying
    } else {
      return playerGameStore.isSeated
    }
  })
  
  const mySeatColor = computed(() => {
    if (isHost.value) {
      return hostGameStore.hostAsPlayerColor
    } else {
      return playerGameStore.mySeatColor
    }
  })
  
  const isSpectator = computed(() => {
    if (isHost.value) {
      return false
    } else {
      return playerGameStore.isSpectator
    }
  })
  
  const bothSeatsOccupied = computed(() => activeStore.value.bothSeatsOccupied)
  const availableSeats = computed(() => activeStore.value.availableSeats)
  const spectatorsCount = computed(() => activeStore.value.spectatorsCount)
  
  // Acciones (proxy al store activo)
  function selectPiece(position) {
    if (isHost.value) {
      return hostGameStore.selectPieceAsHost(position)
    } else {
      return playerGameStore.selectPiece(position)
    }
  }
  
  function movePiece(toPosition) {
    if (isHost.value) {
      return hostGameStore.makeMoveAsHost(toPosition)
    } else {
      return playerGameStore.makeMove(toPosition)
    }
  }
  
  function applyRemoteMove(moveData) {
    if (isHost.value) {
      // El host debería recibir movimientos via handleGuestMessage, no applyRemoteMove
      console.warn('applyRemoteMove llamado en modo host - usar handleGuestMessage en su lugar')
    } else {
      return playerGameStore.applyMoveFromHost(moveData)
    }
  }
  
  function startGame(asHost = false, color = 'white') {
    isHostRef.value = asHost
    
    if (asHost) {
      // Inicializar juego como host
      hostGameStore.initializeGameAsHost()
      if (color) {
        hostGameStore.occupySeatAsHost(color)
      }
    } else {
      // Player se une a juego existente
      playerGameStore.playerColor = color
      playerGameStore.gameStatus = 'playing'
    }
  }
  
  function joinGame(color = 'black') {
    playerGameStore.playerColor = color
    playerGameStore.gameStatus = 'playing'
    isHostRef.value = false
  }
  
  function resetGame() {
    if (isHost.value) {
      return hostGameStore.resetGame()
    } else {
      return playerGameStore.resetLocalGame()
    }
  }
  
  function surrender() {
    if (isHost.value) {
      // El host puede terminar el juego
      hostGameStore.endGame(
        hostGameStore.hostAsPlayerColor === 'white' ? 'black' : 'white',
        'surrender_by_host'
      )
    } else {
      return playerGameStore.surrender()
    }
  }
  
  function occupySeat(color, playerToken, playerName = null) {
    if (isHost.value) {
      return hostGameStore.occupySeatAsHost(color)
    } else {
      return playerGameStore.requestSeat(color)
    }
  }
  
  function vacateSeat(color, notifyOthers = true) {
    if (isHost.value) {
      if (hostGameStore.hostAsPlayerColor === color) {
        return hostGameStore.leaveSeatAsHost()
      }
      // Si el host está liberando el asiento de un guest
      const seatColor = hostGameStore.getSeatColorByToken(color)
      if (seatColor) {
        // Llamar a vacateSeat del hostGameStore
        // Nota: Esto requiere una función adicional en hostGameStore
        console.warn('vacateSeat para guest no implementado en adaptador')
      }
    } else {
      if (playerGameStore.mySeatColor === color) {
        return playerGameStore.requestLeaveSeat()
      }
    }
    return false
  }
  
  function addSpectator(token, playerName = null, notifyOthers = true) {
    if (isHost.value) {
      // hostGameStore.addSpectator no existe aún, pero podríamos implementarlo
      console.warn('addSpectator no implementado para host en adaptador')
    } else {
      // Los players no pueden añadir espectadores
      console.warn('Players no pueden añadir espectadores')
    }
  }
  
  function removeSpectator(token, notifyOthers = true) {
    if (isHost.value) {
      // hostGameStore.removeSpectator no existe aún
      console.warn('removeSpectator no implementado para host en adaptador')
    } else {
      // Los players no pueden remover espectadores
      console.warn('Players no pueden remover espectadores')
    }
  }
  
  function leaveSeat() {
    if (isHost.value) {
      return hostGameStore.leaveSeatAsHost()
    } else {
      return playerGameStore.requestLeaveSeat()
    }
  }
  
  function takeSeat(color) {
    return occupySeat(color, connectionStore.uuid, connectionStore.shortToken)
  }
  
  // Inicializar WebSocket listeners (delegar a stores individuales)
  function initWebSocketListeners() {
    // Los stores individuales ya tienen sus propios listeners
    console.log('GameStoreAdapter: Los listeners WebSocket están en los stores individuales')
  }
  
  // Inicializar (los stores individuales ya se inicializan automáticamente)
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
    isHost: isHostRef,
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
    takeSeat,
    initWebSocketListeners
  }
})