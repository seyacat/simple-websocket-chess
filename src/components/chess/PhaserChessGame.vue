<template>
  <div class="phaser-chess-game">
    <div ref="gameContainer" class="game-container"></div>
    
    <!-- Overlay de selección de asientos -->
    <SeatSelectionOverlay
      v-if="shouldShowSeatSelection"
      @close="onSeatSelectionClose"
    />
    
    <!-- Indicador de estado del jugador -->
    <div v-if="gameInitialized && !shouldShowSeatSelection" class="player-status-indicator" :class="playerStatusClass">
      <span class="status-icon">{{ playerStatusIcon }}</span>
      <span class="status-text">{{ playerStatusText }}</span>
      <button v-if="isSeated && gameStatus !== 'playing'" @click="showSeatSelection = true" class="change-seat-btn">
        Cambiar asiento
      </button>
    </div>
    
    <div v-if="!gameInitialized" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>Inicializando juego...</p>
    </div>
    
    <div v-if="gameError" class="error-overlay">
      <p class="error-message">{{ gameError }}</p>
      <button @click="retryInitialization" class="retry-button">Reintentar</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import Phaser from 'phaser'
import { useHostGameStore } from '@/stores/hostGameStore'
import { usePlayerGameStore } from '@/stores/playerGameStore'
import { useConnectionStore } from '@/stores/connectionStore'
import SeatSelectionOverlay from './SeatSelectionOverlay.vue'

// Props
const props = defineProps({
  boardSize: {
    type: Number,
    default: 800
  }
})

// Refs
const gameContainer = ref(null)
const game = ref(null)
const gameInitialized = ref(false)
const gameError = ref(null)
const showSeatSelection = ref(true) // Mostrar overlay de asientos por defecto

// Stores
const connectionStore = useConnectionStore()

// Determinar qué store usar basado en el modo
const isHost = computed(() => connectionStore.isHost)
const hostGameStore = useHostGameStore()
const playerGameStore = usePlayerGameStore()

// Store activo (proxy que delega al store correcto)
const activeStore = computed(() => {
  return isHost.value ? hostGameStore : playerGameStore
})

// Estado del juego desde el store activo (computed para reactividad)
const board = computed(() => activeStore.value.board)
const currentTurn = computed(() => activeStore.value.currentTurn)
const selectedPiece = computed(() => activeStore.value.selectedPiece)
const validMoves = computed(() => activeStore.value.validMoves)
const gameStatus = computed(() => activeStore.value.gameStatus)
const moveHistory = computed(() => activeStore.value.moveHistory)
const playerColor = computed(() => activeStore.value.playerColor)
const seats = computed(() => activeStore.value.seats)
const spectators = computed(() => activeStore.value.spectators)

// Getters específicos del store activo
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
    return false // El host nunca es espectador
  } else {
    return playerGameStore.isSpectator
  }
})

const bothSeatsOccupied = computed(() => activeStore.value.bothSeatsOccupied)
const availableSeats = computed(() => activeStore.value.availableSeats)
const spectatorsCount = computed(() => activeStore.value.spectatorsCount)

// Computed properties para UI
const playerStatusText = computed(() => {
  if (isSeated.value) {
    const colorText = mySeatColor.value === 'white' ? 'Blancas' : 'Negras'
    return `Jugador (${colorText})${isHost.value ? ' [Host]' : ''}`
  } else if (isSpectator.value) {
    return 'Espectador'
  } else if (isHost.value) {
    return 'Host (sin asiento)'
  } else {
    return 'Sin asiento'
  }
})

const playerStatusIcon = computed(() => {
  if (isSeated.value) {
    return mySeatColor.value === 'white' ? '♔' : '♚'
  } else if (isSpectator.value) {
    return '👁️'
  } else if (isHost.value) {
    return '🏠'
  } else {
    return '🚫'
  }
})

const playerStatusClass = computed(() => {
  if (isSeated.value) {
    return `player-status-seated player-status-${mySeatColor.value}`
  } else if (isSpectator.value) {
    return 'player-status-spectator'
  } else {
    return 'player-status-no-seat'
  }
})

const shouldShowSeatSelection = computed(() => {
  return showSeatSelection.value && !isSeated.value && connectionStore.isConnected
})

// Watchers
watch(() => board.value, (newBoard) => {
  if (gameInitialized.value && game.value) {
    updateBoardInPhaser(newBoard)
  }
}, { deep: true })

watch(() => gameStatus.value, (newStatus) => {
  if (gameInitialized.value && game.value) {
    updateGameStatusInPhaser(newStatus)
  }
})

// Métodos
function onSeatSelectionClose() {
  showSeatSelection.value = false
}

function retryInitialization() {
  gameError.value = null
  initializeGame()
}

// Funciones de interacción con el juego
function handleSquareClick(row, col) {
  if (!isSeated.value || gameStatus.value !== 'playing') {
    return
  }
  
  // Verificar si es el turno del jugador
  const isMyTurn = isHost.value 
    ? hostGameStore.isHostTurn 
    : playerGameStore.isMyTurn
  
  if (!isMyTurn) {
    console.log('No es tu turno')
    return
  }
  
  // Si hay una pieza seleccionada, intentar mover
  if (selectedPiece.value) {
    const moveSuccess = isHost.value
      ? hostGameStore.makeMoveAsHost({ row, col })
      : playerGameStore.makeMove({ row, col })
    
    if (moveSuccess) {
      console.log('Movimiento realizado')
    }
  } else {
    // Seleccionar pieza
    if (isHost.value) {
      hostGameStore.selectPieceAsHost({ row, col })
    } else {
      playerGameStore.selectPiece({ row, col })
    }
  }
}

function occupySeat(color) {
  if (isHost.value) {
    return hostGameStore.occupySeatAsHost(color)
  } else {
    return playerGameStore.requestSeat(color)
  }
}

function leaveSeat() {
  if (isHost.value) {
    return hostGameStore.leaveSeatAsHost()
  } else {
    return playerGameStore.requestLeaveSeat()
  }
}

// Funciones Phaser (simplificadas - mantener la lógica existente)
function initializeGame() {
  try {
    if (!gameContainer.value) {
      gameError.value = 'Contenedor del juego no encontrado'
      return
    }
    
    const config = {
      type: Phaser.AUTO,
      width: props.boardSize,
      height: props.boardSize,
      parent: gameContainer.value,
      scene: {
        preload: preload,
        create: create,
        update: update
      },
      backgroundColor: '#f0d9b5'
    }
    
    game.value = new Phaser.Game(config)
    gameInitialized.value = true
  } catch (error) {
    console.error('Error inicializando juego Phaser:', error)
    gameError.value = 'Error al inicializar el juego'
  }
}

function preload() {
  // Precargar assets (mantener lógica existente)
  this.load.image('white-square', 'assets/white-square.png')
  this.load.image('black-square', 'assets/black-square.png')
  // ... más assets
}

function create() {
  // Crear tablero (mantener lógica existente)
  createBoard.call(this)
  updateBoardInPhaser.call(this, board.value)
}

function update() {
  // Lógica de actualización (mantener lógica existente)
}

function createBoard() {
  // Implementación existente del tablero Phaser
  const squareSize = props.boardSize / 8
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const x = col * squareSize + squareSize / 2
      const y = row * squareSize + squareSize / 2
      
      const isWhite = (row + col) % 2 === 0
      const square = this.add.image(x, y, isWhite ? 'white-square' : 'black-square')
        .setDisplaySize(squareSize, squareSize)
        .setInteractive()
      
      square.row = row
      square.col = col
      
      square.on('pointerdown', () => {
        handleSquareClick(row, col)
      })
    }
  }
}

function updateBoardInPhaser(newBoard) {
  // Actualizar tablero Phaser con el nuevo estado
  if (!game.value || !game.value.scene) return
  
  const scene = game.value.scene.getScene('default')
  if (!scene) return
  
  // Implementación para actualizar piezas en el tablero Phaser
  // (mantener lógica existente)
}

function updateGameStatusInPhaser(newStatus) {
  // Actualizar UI de estado del juego en Phaser
  // (mantener lógica existente)
}

// Lifecycle hooks
onMounted(() => {
  initializeGame()
})

onBeforeUnmount(() => {
  if (game.value) {
    game.value.destroy(true)
    game.value = null
  }
})

// Exponer métodos para el componente padre (si es necesario)
defineExpose({
  occupySeat,
  leaveSeat,
  resetGame: isHost.value ? hostGameStore.resetGame : playerGameStore.resetLocalGame
})
</script>

<style scoped>
.phaser-chess-game {
  position: relative;
  width: 100%;
  height: 100%;
}

.game-container {
  width: 100%;
  height: 100%;
}

.loading-overlay,
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  z-index: 1000;
}

.player-status-indicator {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 8px 12px;
  border-radius: 4px;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 100;
}

.player-status-seated.player-status-white {
  border-left: 4px solid white;
}

.player-status-seated.player-status-black {
  border-left: 4px solid black;
}

.player-status-spectator {
  border-left: 4px solid gray;
}

.player-status-no-seat {
  border-left: 4px solid orange;
}

.change-seat-btn {
  margin-left: 8px;
  padding: 4px 8px;
  background-color: #4a5568;
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}

.change-seat-btn:hover {
  background-color: #2d3748;
}
</style>