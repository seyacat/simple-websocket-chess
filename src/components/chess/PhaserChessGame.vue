<template>
  <div class="phaser-chess-game">
    <!-- Overlay superior: Asiento Negras -->
    <div class="seat-bar black-seat-bar">
      <div v-if="seats.black.occupied" class="seat-info occupied">
        <span class="seat-icon">♚</span>
        <span class="player-name">{{ seats.black.playerName || 'Jugador' }}</span>
        <button 
          v-if="mySeatColor === 'black'" 
          @click="leaveSeat" 
          class="leave-seat-btn"
        >
          Dejar Asiento
        </button>
      </div>
      <div v-else class="seat-info available">
        <span class="empty-seat">Asiento vacío (Negras)</span>
        <button 
          v-if="!isSeated" 
          @click="occupySeat('black')" 
          class="take-seat-btn black-btn"
        >
          Ocupar Negras
        </button>
      </div>
    </div>

    <!-- Contenedor del juego de Phaser -->
    <div class="board-wrapper">
      <div ref="gameContainer" class="game-container"></div>
      
      <div v-if="!gameInitialized" class="loading-overlay">
        <div class="loading-spinner"></div>
        <p>Inicializando juego...</p>
      </div>
      
      <div v-if="gameError" class="error-overlay">
        <p class="error-message">{{ gameError }}</p>
        <button @click="retryInitialization" class="retry-button">Reintentar</button>
      </div>

      <!-- Mensajes flotantes del juego sobre el tablero -->
      <div v-if="gameStatus === 'paused'" class="board-message">
        <p>⏸️ Pausa - Esperando jugador</p>
      </div>
      <div v-if="gameStatus === 'waiting' && !bothSeatsOccupied" class="board-message warning">
        <p>⏳ Esperando jugadores</p>
      </div>
    </div>

    <!-- Overlay inferior: Asiento Blancas -->
    <div class="seat-bar white-seat-bar">
      <div v-if="seats.white.occupied" class="seat-info occupied">
        <span class="seat-icon">♔</span>
        <span class="player-name">{{ seats.white.playerName || 'Jugador' }}</span>
        <button 
          v-if="mySeatColor === 'white'" 
          @click="leaveSeat" 
          class="leave-seat-btn"
        >
          Dejar Asiento
        </button>
      </div>
      <div v-else class="seat-info available">
        <span class="empty-seat">Asiento vacío (Blancas)</span>
        <button 
          v-if="!isSeated" 
          @click="occupySeat('white')" 
          class="take-seat-btn white-btn"
        >
          Ocupar Blancas
        </button>
      </div>
    </div>

    <!-- Información adicional (Espectadores y estado local) -->
    <div class="game-footer-info">
      <div class="player-status-indicator" :class="playerStatusClass">
        <span class="status-icon">{{ playerStatusIcon }}</span>
        <span class="status-text">{{ playerStatusText }}</span>
      </div>
      <div class="spectators-info">
        Espectadores: {{ spectatorsCount }} 👁️
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import Phaser from 'phaser'
import { useHostGameStore } from '@/stores/hostGameStore'
import { usePlayerGameStore } from '@/stores/playerGameStore'
import { useConnectionStore } from '@/stores/connectionStore'

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

// Funciones Phaser
function initializeGame() {
  try {
    if (!gameContainer.value) {
      gameError.value = 'Contenedor del juego no encontrado'
      return
    }
    
    // Scale down a bit to ensure space for the seat bars
    const actualSize = Math.min(props.boardSize, 500)
    
    const config = {
      type: Phaser.AUTO,
      width: actualSize,
      height: actualSize,
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

function preload() {}

function create() {
  createSquareTextures.call(this)
  createBoard.call(this)
  updateBoardInPhaser.call(this, board.value)
}

function createSquareTextures() {
  const squareSize = 64 
  
  const whiteGraphics = this.add.graphics()
  whiteGraphics.fillStyle(0xf0d9b5, 1) // Color beige claro
  whiteGraphics.fillRect(0, 0, squareSize, squareSize)
  whiteGraphics.generateTexture('white-square', squareSize, squareSize)
  whiteGraphics.destroy()
  
  const blackGraphics = this.add.graphics()
  blackGraphics.fillStyle(0xb58863, 1) // Color marrón
  blackGraphics.fillRect(0, 0, squareSize, squareSize)
  blackGraphics.generateTexture('black-square', squareSize, squareSize)
  blackGraphics.destroy()
}

function update() {}

function createBoard() {
  const squareSize = game.value.config.width / 8
  
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
  if (!game.value || !game.value.scene) return
  
  const scene = game.value.scene.getScene('default')
  if (!scene) return
  
  if (scene.pieceGroup) {
    scene.pieceGroup.clear(true, true)
  } else {
    scene.pieceGroup = scene.add.group()
  }
  
  const squareSize = game.value.config.width / 8
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = newBoard[row][col]
      if (!piece) continue
      
      const x = col * squareSize + squareSize / 2
      const y = row * squareSize + squareSize / 2
      
      const pieceText = scene.add.text(x, y, getPieceSymbol(piece), {
        fontSize: Math.floor(squareSize * 0.6) + 'px',
        fontFamily: 'Arial, sans-serif',
        color: getPieceColor(piece) === 'white' ? '#FFFFFF' : '#000000',
        stroke: getPieceColor(piece) === 'white' ? '#000000' : '#FFFFFF',
        strokeThickness: 2,
        align: 'center'
      })
      .setOrigin(0.5)
      
      scene.pieceGroup.add(pieceText)
    }
  }
  
  // Highlight valid moves if there is a selected piece
  if (selectedPiece.value) {
     highlightValidMoves.call(scene, validMoves.value, squareSize)
  }
}

function highlightValidMoves(moves, squareSize) {
   // Add highlight indicators (small circles) for valid moves
   const scene = this
   if (!scene.highlightGroup) {
      scene.highlightGroup = scene.add.group()
   } else {
      scene.highlightGroup.clear(true, true)
   }
   
   moves.forEach(move => {
      const x = move.col * squareSize + squareSize / 2
      const y = move.row * squareSize + squareSize / 2
      
      const dot = scene.add.circle(x, y, squareSize * 0.15, 0x000000, 0.3)
      scene.highlightGroup.add(dot)
   })
}

// Modified watcher to redraw valid moves
watch(() => selectedPiece.value, () => {
   if (gameInitialized.value && game.value) {
      updateBoardInPhaser(board.value) // Redraws everything including highlights
   }
})


function getPieceSymbol(piece) {
  const pieceMap = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
  }
  return pieceMap[piece] || piece
}

function getPieceColor(piece) {
  if (!piece) return null
  return piece === piece.toUpperCase() ? 'white' : 'black'
}

function updateGameStatusInPhaser(newStatus) {}

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

// Exponer métodos para el componente padre
defineExpose({
  occupySeat,
  leaveSeat,
  resetGame: isHost.value ? hostGameStore.resetGame : playerGameStore.resetLocalGame
})
</script>

<style scoped>
.phaser-chess-game {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;
  gap: 15px;
  padding: 10px;
}

.seat-bar {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  max-width: 500px;
  padding: 10px 15px;
  border-radius: 8px;
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.black-seat-bar {
  border-top: 4px solid #212121;
}

.white-seat-bar {
  border-bottom: 4px solid #f5f5f5;
}

.seat-info {
  display: flex;
  align-items: center;
  gap: 15px;
  width: 100%;
  justify-content: space-between;
}

.seat-icon {
  font-size: 24px;
}

.player-name {
  font-weight: bold;
  flex-grow: 1;
}

.empty-seat {
  color: var(--color-text-secondary);
  font-style: italic;
  flex-grow: 1;
}

.take-seat-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  color: white;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.black-btn {
  background-color: #424242;
}

.black-btn:hover {
  background-color: #212121;
}

.white-btn {
  background-color: #e0e0e0;
  color: #000;
}

.white-btn:hover {
  background-color: #bdbdbd;
}

.leave-seat-btn {
  padding: 8px 16px;
  background-color: var(--color-warning);
  color: white;
  border: none;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
}

.leave-seat-btn:hover {
  background-color: #e65100;
}

.board-wrapper {
  position: relative;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: var(--shadow-md);
}

.game-container {
  display: flex;
  justify-content: center;
}

.board-message {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(33, 150, 243, 0.85);
  color: white;
  padding: 10px 20px;
  border-radius: 20px;
  font-weight: bold;
  pointer-events: none;
}

.board-message.warning {
  background: rgba(255, 152, 0, 0.85);
}

.game-footer-info {
  display: flex;
  justify-content: space-between;
  width: 100%;
  max-width: 500px;
  align-items: center;
  padding: 5px 10px;
}

.player-status-indicator {
  padding: 6px 12px;
  border-radius: 20px;
  background-color: var(--color-surface);
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  box-shadow: var(--shadow-sm);
}

.player-status-seated.player-status-white {
  border-left: 4px solid #f5f5f5;
}

.player-status-seated.player-status-black {
  border-left: 4px solid #212121;
}

.player-status-spectator {
  border-left: 4px solid gray;
}

.player-status-no-seat {
  border-left: 4px solid orange;
}

.spectators-info {
  font-size: 14px;
  color: var(--color-text-secondary);
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
}
</style>