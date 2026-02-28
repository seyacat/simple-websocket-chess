<template>
  <div class="phaser-chess-game">
    <div ref="gameContainer" class="game-container"></div>
    
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
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import Phaser from 'phaser'
import { useGameStore } from '@/stores/gameStore'
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
const gameStore = useGameStore()
const connectionStore = useConnectionStore()

// Configuración de Phaser
const phaserConfig = {
  type: Phaser.AUTO,
  parent: null, // Se establecerá en mounted
  width: props.boardSize,
  height: props.boardSize,
  backgroundColor: '#f0f0f0',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: {
    preload: preload,
    create: create,
    update: update
  }
}

// Variables de la escena
let scene = null
let boardGraphics = null
let pieceSprites = []
let selectedPiece = null
let validMoveIndicators = []

// Assets (placeholders - se reemplazarán con assets reales)
const pieceAssets = {
  'white': {
    'king': 'white_king',
    'queen': 'white_queen',
    'rook': 'white_rook',
    'bishop': 'white_bishop',
    'knight': 'white_knight',
    'pawn': 'white_pawn'
  },
  'black': {
    'king': 'black_king',
    'queen': 'black_queen',
    'rook': 'black_rook',
    'bishop': 'black_bishop',
    'knight': 'black_knight',
    'pawn': 'black_pawn'
  }
}

// Funciones de la escena Phaser
function preload() {
  scene = this
  
  // Cargar assets placeholder (cuadrados de colores)
  scene.load.image('white_square', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
  scene.load.image('black_square', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')
  
  // Cargar piezas placeholder (usaremos gráficos generados)
  // En una implementación real, cargaríamos sprites reales
}

function create() {
  scene = this
  
  // Registrar store en el registry para acceso desde Phaser
  scene.registry.set('gameStore', gameStore)
  scene.registry.set('connectionStore', connectionStore)
  
  // Crear tablero
  createBoard()
  
  // Crear piezas
  createPieces()
  
  // Configurar input
  setupInput()
  
  // Marcar como inicializado
  gameInitialized.value = true
  gameError.value = null
  
  console.log('Juego Phaser inicializado')
}

function update() {
  // Actualización por frame
  // Podemos usar esto para animaciones suaves
}

function createBoard() {
  const squareSize = props.boardSize / 8
  
  // Limpiar gráficos previos
  if (boardGraphics) {
    boardGraphics.destroy()
  }
  
  boardGraphics = scene.add.graphics()
  
  // Dibujar tablero 8x8
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const x = col * squareSize
      const y = row * squareSize
      
      // Alternar colores
      const isLight = (row + col) % 2 === 0
      const color = isLight ? 0xf0d9b5 : 0xb58863 // Colores de ajedrez estándar
      
      boardGraphics.fillStyle(color, 1)
      boardGraphics.fillRect(x, y, squareSize, squareSize)
      
      // Añadir borde
      boardGraphics.lineStyle(1, 0x000000, 0.2)
      boardGraphics.strokeRect(x, y, squareSize, squareSize)
      
      // Crear zona interactiva
      const zone = scene.add.zone(x + squareSize / 2, y + squareSize / 2, squareSize, squareSize)
      zone.setInteractive()
      zone.setData('row', row)
      zone.setData('col', col)
    }
  }
}

function createPieces() {
  // Limpiar piezas previas
  pieceSprites.forEach(sprite => sprite.destroy())
  pieceSprites = []
  
  const squareSize = props.boardSize / 8
  const board = gameStore.board
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col]
      if (!piece) continue
      
      const x = col * squareSize + squareSize / 2
      const y = row * squareSize + squareSize / 2
      
      // Determinar color y tipo de pieza
      const isWhite = piece === piece.toUpperCase()
      const color = isWhite ? 'white' : 'black'
      const type = getPieceType(piece)
      
      // Crear sprite placeholder
      const sprite = createPieceSprite(x, y, squareSize, color, type)
      sprite.setData('row', row)
      sprite.setData('col', col)
      sprite.setData('piece', piece)
      
      pieceSprites.push(sprite)
    }
  }
}

function createPieceSprite(x, y, size, color, type) {
  // Crear gráfico placeholder (círculo con letra)
  const graphics = scene.add.graphics()
  
  // Color de la pieza
  const fillColor = color === 'white' ? 0xffffff : 0x333333
  const borderColor = color === 'white' ? 0x666666 : 0x000000
  
  // Dibujar círculo
  graphics.fillStyle(fillColor, 1)
  graphics.fillCircle(0, 0, size * 0.4)
  
  // Borde
  graphics.lineStyle(2, borderColor, 1)
  graphics.strokeCircle(0, 0, size * 0.4)
  
  // Letra representando la pieza
  const pieceLetter = getPieceLetter(type)
  const text = scene.add.text(0, 0, pieceLetter, {
    fontSize: `${size * 0.3}px`,
    color: color === 'white' ? '#333' : '#fff',
    fontFamily: 'Arial, sans-serif',
    fontWeight: 'bold'
  })
  text.setOrigin(0.5)
  
  // Crear contenedor
  const container = scene.add.container(x, y, [graphics, text])
  container.setSize(size * 0.8, size * 0.8)
  container.setInteractive()
  
  return container
}

function getPieceType(piece) {
  const lowerPiece = piece.toLowerCase()
  switch (lowerPiece) {
    case 'k': return 'king'
    case 'q': return 'queen'
    case 'r': return 'rook'
    case 'b': return 'bishop'
    case 'n': return 'knight'
    case 'p': return 'pawn'
    default: return 'pawn'
  }
}

function getPieceLetter(type) {
  switch (type) {
    case 'king': return 'K'
    case 'queen': return 'Q'
    case 'rook': return 'R'
    case 'bishop': return 'B'
    case 'knight': return 'N'
    case 'pawn': return 'P'
    default: return '?'
  }
}

function setupInput() {
  // Configurar eventos de input para las piezas
  pieceSprites.forEach(sprite => {
    sprite.on('pointerdown', () => {
      const row = sprite.getData('row')
      const col = sprite.getData('col')
      const piece = sprite.getData('piece')
      
      // Verificar si es el turno del jugador y la pieza es de su color
      const isWhite = piece === piece.toUpperCase()
      const isPlayersPiece = (gameStore.playerColor === 'white' && isWhite) ||
                            (gameStore.playerColor === 'black' && !isWhite)
      
      if (isPlayersPiece && gameStore.isMyTurn) {
        handlePieceSelection(row, col)
      }
    })
  })
  
  // Configurar eventos para las zonas del tablero
  scene.children.each(child => {
    if (child.getData && child.getData('row') !== undefined) {
      child.on('pointerdown', () => {
        const row = child.getData('row')
        const col = child.getData('col')
        
        if (selectedPiece) {
          handlePieceMove(row, col)
        }
      })
    }
  })
}

function handlePieceSelection(row, col) {
  // Limpiar selección previa
  clearSelection()
  
  // Seleccionar pieza
  selectedPiece = { row, col }
  
  // Resaltar pieza seleccionada
  const sprite = getPieceAt(row, col)
  if (sprite) {
    sprite.setAlpha(0.8)
    sprite.setScale(1.1)
  }
  
  // Mostrar movimientos válidos
  showValidMoves(row, col)
  
  // Notificar al store
  gameStore.selectPiece({ row, col })
}

function handlePieceMove(toRow, toCol) {
  if (!selectedPiece) return
  
  // Verificar si el movimiento es válido
  const isValid = gameStore.validMoves.some(move => 
    move.row === toRow && move.col === toCol
  )
  
  if (!isValid) {
    clearSelection()
    return
  }
  
  // Mover pieza visualmente
  movePieceVisual(selectedPiece.row, selectedPiece.col, toRow, toCol)
  
  // Notificar al store
  gameStore.movePiece({ row: toRow, col: toCol })
  
  // Limpiar selección
  clearSelection()
}

function movePieceVisual(fromRow, fromCol, toRow, toCol) {
  const sprite = getPieceAt(fromRow, fromCol)
  if (!sprite) return
  
  const squareSize = props.boardSize / 8
  const targetX = toCol * squareSize + squareSize / 2
  const targetY = toRow * squareSize + squareSize / 2
  
  // Animación de movimiento
  scene.tweens.add({
    targets: sprite,
    x: targetX,
    y: targetY,
    duration: 300,
    ease: 'Power2'
  })
  
  // Actualizar datos del sprite
  sprite.setData('row', toRow)
  sprite.setData('col', toCol)
  
  // Si hay una pieza en la casilla destino (captura), eliminarla
  const capturedSprite = getPieceAt(toRow, toCol)
  if (capturedSprite && capturedSprite !== sprite) {
    scene.tweens.add({
      targets: capturedSprite,
      alpha: 0,
      scale: 0,
      duration: 200,
      onComplete: () => {
        capturedSprite.destroy()
        // Remover de la lista
        const index = pieceSprites.indexOf(capturedSprite)
        if (index > -1) {
          pieceSprites.splice(index, 1)
        }
      }
    })
  }
}

function showValidMoves(row, col) {
  clearValidMoves()
  
  const squareSize = props.boardSize / 8
  
  gameStore.validMoves.forEach(move => {
    const x = move.col * squareSize + squareSize / 2
    const y = move.row * squareSize + squareSize / 2
    
    // Crear indicador de movimiento válido
    const graphics = scene.add.graphics()
    graphics.fillStyle(0x00ff00, 0.3)
    graphics.fillCircle(x, y, squareSize * 0.2)
    
    graphics.lineStyle(2, 0x00aa00, 0.6)
    graphics.strokeCircle(x, y, squareSize * 0.2)
    
    validMoveIndicators.push(graphics)
  })
}

function clearSelection() {
  if (selectedPiece) {
    const sprite = getPieceAt(selectedPiece.row, selectedPiece.col)
    if (sprite) {
      sprite.setAlpha(1)
      sprite.setScale(1)
    }
    selectedPiece = null
  }
  
  clearValidMoves()
}

function clearValidMoves() {
  validMoveIndicators.forEach(indicator => indicator.destroy())
  validMoveIndicators = []
}

function getPieceAt(row, col) {
  return pieceSprites.find(sprite => 
    sprite.getData('row') === row && sprite.getData('col') === col
  )
}

// Métodos del componente Vue
function initializeGame() {
  try {
    if (!gameContainer.value) {
      throw new Error('Contenedor del juego no encontrado')
    }
    
    // Configurar parent en la configuración
    phaserConfig.parent = gameContainer.value
    
    // Crear instancia de Phaser
    game.value = new Phaser.Game(phaserConfig)
    
  } catch (error) {
    console.error('Error inicializando juego Phaser:', error)
    gameError.value = `Error al inicializar el juego: ${error.message}`
    gameInitialized.value = false
  }
}

function retryInitialization() {
  if (game.value) {
    game.value.destroy(true)
    game.value = null
  }
  
  gameError.value = null
  initializeGame()
}

// Watchers para sincronizar con el store
watch(() => gameStore.board, (newBoard) => {
  // Actualizar piezas cuando cambie el tablero
  if (gameInitialized.value && scene) {
    createPieces()
    setupInput()
  }
}, { deep: true })

watch(() => gameStore.selectedPiece, (newSelection) => {
  // Sincronizar selección
  if (gameInitialized.value && scene) {
    if (newSelection) {
      handlePieceSelection(newSelection.row, newSelection.col)
    } else {
      clearSelection()
    }
  }
})

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
</script>

<style scoped>
.phaser-chess-game {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 400px;
}

.game-container {
  width: 100%;
  height: 100%;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.loading-overlay,
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: rgba(255, 255, 255, 0.9);
  z-index: 10;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  color: #e74c3c;
  margin-bottom: 16px;
  text-align: center;
  max-width: 80%;
}

.retry-button {
  padding: 8px 16px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.retry-button:hover {
  background: #2980b9;
}
</style>