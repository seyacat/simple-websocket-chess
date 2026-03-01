<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import LobbyView from './components/lobby/LobbyView.vue'
import PhaserChessGame from './components/chess/PhaserChessGame.vue'
import { useGameStore } from './stores/gameStore'
import { useConnectionStore } from '@/stores/connectionStore'
import { getWebSocketService } from '@/services/WebSocketService'

// Stores
const gameStore = useGameStore()
const connectionStore = useConnectionStore()
const wsService = getWebSocketService()

// Estado local
const showGameControls = ref(true)
const boardSize = ref(600)
const currentView = ref('lobby') // 'lobby', 'game'
const isConnecting = ref(false)

// Computed
const gameTitle = computed(() => {
  if (gameStore.gameStatus === 'playing') {
    return `Ajedrez - Turno: ${gameStore.currentTurn === 'white' ? 'Blancas' : 'Negras'}`
  }
  
  switch (currentView.value) {
    case 'lobby':
      if (!connectionStore.isConnected) {
        return 'Lobby de Ajedrez - Conectando...'
      }
      return 'Lobby de Ajedrez'
    case 'game':
      if (gameStore.gameStatus === 'paused') {
        return 'Ajedrez - Juego en pausa'
      }
      return 'Ajedrez - Configurando asientos'
    default:
      return 'Ajedrez con WebSocket'
  }
})

const playerInfo = computed(() => {
  if (gameStore.gameStatus === 'playing') {
    return `Eres las ${gameStore.playerColor === 'white' ? 'blancas' : 'negras'} ${gameStore.isHost ? '(Host)' : '(Guest)'}`
  }
  
  switch (currentView.value) {
    case 'lobby':
      if (!connectionStore.isConnected) {
        return 'Conectando al servidor...'
      }
      return 'Selecciona o crea un juego para comenzar'
    case 'game':
      if (gameStore.isSeated) {
        return `Jugador (${gameStore.mySeatColor === 'white' ? 'Blancas' : 'Negras'})`
      } else if (gameStore.isSpectator) {
        return `Espectador (${gameStore.spectatorsCount} total)`
      } else {
        return 'Selecciona un asiento para jugar'
      }
    default:
      return 'Conectando al servidor...'
  }
})

const canShowGame = computed(() => {
  // Siempre mostrar el juego cuando estamos en la vista de juego
  // El overlay de selección de asientos manejará la interacción
  return currentView.value === 'game'
})

// Determinar vista actual basada en estado
const determineCurrentView = () => {
  if (!connectionStore.isConnected) {
    currentView.value = 'lobby'
    return
  }

  // Si está conectado pero no tiene modo (no es host ni guest), mostrar lobby
  if (!connectionStore.mode) {
    currentView.value = 'lobby'
    return
  }

  // Si es host o guest, ir al juego (tablero con selección de asientos)
  // El sistema de asientos manejará si el usuario es jugador o espectador
  currentView.value = 'game'
}

// Conectar automáticamente al WebSocket
const autoConnect = async () => {
  if (connectionStore.isConnected || isConnecting.value) {
    return
  }
  
  isConnecting.value = true
  try {
    console.log('Conectando automáticamente al servidor WebSocket...')
    await wsService.connect()
    console.log('Conexión WebSocket establecida automáticamente')
  } catch (error) {
    console.error('Error al conectar automáticamente:', error)
    // El servicio de WebSocket manejará la reconexión automática
  } finally {
    isConnecting.value = false
  }
}

// Watchers para cambios de estado
watch(() => connectionStore.isConnected, determineCurrentView)
watch(() => connectionStore.mode, determineCurrentView)
watch(() => gameStore.gameStatus, determineCurrentView)

// Inicializar vista
determineCurrentView()

// Configurar listeners para eventos de WebSocket
wsService.on('mode_set', () => {
  determineCurrentView()
})

wsService.on('subscribed', () => {
  determineCurrentView()
})

wsService.on('broadcast_message', (data) => {
  // Verificar si es un mensaje de inicio de juego
  if (data.message && data.message.startsWith('GAME_START|')) {
    determineCurrentView()
  }
})

// Handler para desconexión del host (para guests)
wsService.on('host_disconnected', () => {
  if (connectionStore.mode === 'guest') {
    // Volver al lobby después de un breve delay
    setTimeout(async () => {
      try {
        // Cambiar modo a null para notificar al servidor
        await wsService.setMode(null)
      } catch (error) {
        console.error('Error cambiando modo después de desconexión del host:', error)
      }
      // Actualizar estado local
      connectionStore.setMode(null)
      connectionStore.setSubscribedHost(null)
      determineCurrentView()
    }, 3000)
  }
})

// Método para volver al lobby
const returnToLobby = async () => {
  try {
    // Si estamos suscritos como guest, desuscribirse primero
    if (connectionStore.isGuest && connectionStore.subscribedHost) {
      await wsService.unsubscribe()
    }
    
    // Cambiar modo a null para notificar al servidor
    await wsService.setMode(null)
    
    // Actualizar estado local
    connectionStore.setMode(null)
    connectionStore.setSubscribedHost(null)
    currentView.value = 'lobby'
  } catch (error) {
    console.error('Error al volver al lobby:', error)
    // Fallback: actualizar estado local aunque falle el servidor
    connectionStore.setMode(null)
    connectionStore.setSubscribedHost(null)
    currentView.value = 'lobby'
  }
}

// Conectar automáticamente al montar el componente
onMounted(() => {
  autoConnect()
})
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <h1>{{ gameTitle }}</h1>
      <p class="subtitle">{{ playerInfo }}</p>
      
      <div v-if="connectionStore.isConnected" class="connection-status-bar">
        <div class="status-item">
          <span class="status-label">Token:</span>
          <code class="status-value">{{ connectionStore.shortToken }}</code>
        </div>
        
        <div v-if="currentView !== 'lobby'" class="status-item">
          <button
            @click="returnToLobby"
            class="back-to-lobby-button"
          >
            Volver al Lobby
          </button>
        </div>
      </div>
      
      <div v-else class="connection-status-bar">
        <div class="status-item">
          <span class="status-label">Estado:</span>
          <span class="status-value">{{ isConnecting ? 'Conectando...' : 'Desconectado' }}</span>
        </div>
      </div>
    </header>

    <main class="app-main">
      <!-- Vista de Lobby -->
      <div v-if="currentView === 'lobby'" class="lobby-container">
        <div class="lobby-wrapper">
          <LobbyView />
        </div>
        
        <div class="connection-status-panel">
          <div class="connection-status-info">
            <h4>Estado de Conexión</h4>
            <div class="status-item">
              <span class="status-label">Servidor:</span>
              <span class="status-value">{{ connectionStore.isConnected ? 'Conectado' : 'Desconectado' }}</span>
            </div>
            <div class="status-item" v-if="connectionStore.isConnected">
              <span class="status-label">Token:</span>
              <code class="status-value">{{ connectionStore.shortToken }}</code>
            </div>
            <div class="status-item" v-if="!connectionStore.isConnected && !isConnecting">
              <button @click="autoConnect" class="reconnect-button">
                Reconectar
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Vista de Juego -->
      <div v-else-if="currentView === 'game'" class="game-container">
        <div class="game-area">
          <div class="phaser-container" :class="{ 'game-active': canShowGame }">
            <PhaserChessGame
              v-if="canShowGame"
              :board-size="boardSize"
              class="chess-game"
            />
            <div v-else class="game-placeholder">
              <div class="placeholder-content">
                <h3>Esperando para comenzar</h3>
                <p>El juego comenzará pronto...</p>
                <div class="placeholder-board">
                  <div class="board-grid">
                    <div v-for="row in 8" :key="row" class="board-row">
                      <div
                        v-for="col in 8"
                        :key="col"
                        class="board-square"
                        :class="{ 'light': (row + col) % 2 === 0, 'dark': (row + col) % 2 !== 0 }"
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="control-panel">
            <div class="connection-status-info">
              <h4>Estado de Conexión</h4>
              <div class="status-item">
                <span class="status-label">Servidor:</span>
                <span class="status-value">{{ connectionStore.isConnected ? 'Conectado' : 'Desconectado' }}</span>
              </div>
              <div class="status-item" v-if="connectionStore.isConnected">
                <span class="status-label">Token:</span>
                <code class="status-value">{{ connectionStore.shortToken }}</code>
              </div>
              <div class="status-item" v-if="!connectionStore.isConnected && !isConnecting">
                <button @click="autoConnect" class="reconnect-button">
                  Reconectar
                </button>
              </div>
            </div>
            
            <div v-if="gameStore.gameStatus === 'playing'" class="game-info-panel">
              <div class="game-status">
                <h4>Estado del Juego</h4>
                <div class="status-item">
                  <span class="status-label">Turno:</span>
                  <span class="status-value" :class="{ 'current-turn': gameStore.isMyTurn }">
                    {{ gameStore.currentTurn === 'white' ? 'Blancas' : 'Negras' }}
                    <span v-if="gameStore.isMyTurn" class="your-turn">(TÚ)</span>
                  </span>
                </div>
                <div class="status-item">
                  <span class="status-label">Estado:</span>
                  <span class="status-value">{{ gameStore.gameStatus }}</span>
                </div>
                <div class="status-item" v-if="gameStore.winner">
                  <span class="status-label">Ganador:</span>
                  <span class="status-value winner">{{ gameStore.winner === 'white' ? 'Blancas' : 'Negras' }}</span>
                </div>
              </div>

              <div class="move-history">
                <h4>Historial de Movimientos</h4>
                <div class="history-list">
                  <div
                    v-for="(move, index) in gameStore.moveHistory.slice().reverse()"
                    :key="index"
                    class="history-item"
                  >
                    <span class="move-number">{{ gameStore.moveHistory.length - index }}.</span>
                    <span class="move-description">{{ move.description }}</span>
                  </div>
                  <div v-if="gameStore.moveHistory.length === 0" class="no-moves">
                    No hay movimientos aún
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  background: var(--color-header-bg);
  padding: 20px;
}

.app-header {
  text-align: center;
  margin-bottom: 30px;
  color: var(--color-text-on-primary);
}

.app-header h1 {
  margin: 0 0 10px 0;
  font-size: 2.5rem;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.subtitle {
  margin: 0 0 20px 0;
  font-size: 1.2rem;
  opacity: 0.9;
  color: var(--color-text-on-primary);
}

.connection-status-bar {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  background: rgba(255, 255, 255, 0.1);
  padding: 10px 20px;
  border-radius: 10px;
  backdrop-filter: blur(10px);
}

.status-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-label {
  font-weight: bold;
  font-size: 0.9rem;
  color: var(--color-text-on-primary);
}

.status-value {
  font-family: monospace;
  background: rgba(0, 0, 0, 0.2);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.9rem;
  color: var(--color-text-on-primary);
}

.back-to-lobby-button {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.2);
  color: var(--color-text-on-primary);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.back-to-lobby-button:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}

.app-main {
  max-width: 1400px;
  margin: 0 auto;
}

.lobby-container {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 30px;
}

.lobby-wrapper {
  background: var(--color-card-bg);
  border-radius: 15px;
  padding: 0;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.connection-status-panel {
  background: var(--color-card-bg);
  border-radius: 15px;
  padding: 20px;
  box-shadow: var(--shadow-lg);
}

.connection-status-info {
  background: var(--color-surface);
  border-radius: 10px;
  padding: 20px;
  box-shadow: var(--shadow-sm);
}

.connection-status-info h4 {
  margin: 0 0 15px 0;
  color: var(--color-text);
  font-size: 1.1rem;
}

.reconnect-button {
  padding: 8px 16px;
  background: var(--color-button-primary);
  color: var(--color-button-primary-text);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
  width: 100%;
}

.reconnect-button:hover {
  background: var(--color-button-primary-hover);
  transform: translateY(-2px);
}

.reconnect-button:disabled {
  background: var(--color-button-secondary);
  cursor: not-allowed;
  transform: none;
}

.host-waiting-container,
.guest-waiting-container {
  background: var(--color-card-bg);
  border-radius: 15px;
  padding: 0;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.game-container {
  background: var(--color-card-bg);
  border-radius: 15px;
  padding: 30px;
  box-shadow: var(--shadow-lg);
}

.game-area {
  display: grid;
  grid-template-columns: 1fr 350px;
  gap: 30px;
}

.phaser-container {
  background: var(--color-surface-variant);
  border-radius: 10px;
  overflow: hidden;
  position: relative;
  min-height: 600px;
}

.phaser-container.game-active {
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}

.chess-game {
  width: 100%;
  height: 100%;
}

.game-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-overlay-dark);
}

.placeholder-content {
  text-align: center;
  color: var(--color-text-on-primary);
  padding: 30px;
}

.placeholder-content h3 {
  margin: 0 0 15px 0;
  font-size: 1.5rem;
}

.placeholder-content p {
  margin: 0 0 30px 0;
  opacity: 0.8;
}

.placeholder-board {
  display: inline-block;
  border: 3px solid var(--color-border-dark);
  border-radius: 5px;
  overflow: hidden;
}

.board-grid {
  display: grid;
  grid-template-rows: repeat(8, 40px);
  gap: 0;
}

.board-row {
  display: grid;
  grid-template-columns: repeat(8, 40px);
  gap: 0;
}

.board-square {
  width: 40px;
  height: 40px;
}

.board-square.light {
  background: var(--color-game-white);
}

.board-square.dark {
  background: var(--color-game-black);
}

.control-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}


.game-info-panel {
  background: var(--color-surface);
  border-radius: 10px;
  padding: 20px;
  box-shadow: var(--shadow-sm);
}

.game-status h4,
.move-history h4 {
  margin: 0 0 15px 0;
  color: var(--color-text);
  font-size: 1.1rem;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border);
}

.status-item:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.status-label {
  font-weight: bold;
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.status-value {
  font-weight: bold;
  color: var(--color-text);
}

.status-value.current-turn {
  color: var(--color-success);
}

.your-turn {
  font-size: 0.8rem;
  color: var(--color-success);
  margin-left: 5px;
}

.status-value.winner {
  color: var(--color-error);
}

.move-history {
  margin-top: 20px;
}

.history-list {
  max-height: 300px;
  overflow-y: auto;
  background: var(--color-card-bg);
  border-radius: 5px;
  padding: 10px;
  border: 1px solid var(--color-border);
}

.history-item {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border-light);
}

.history-item:last-child {
  border-bottom: none;
}

.move-number {
  font-weight: bold;
  color: var(--color-text-secondary);
  min-width: 30px;
}

.move-description {
  flex: 1;
  font-family: monospace;
  font-size: 0.9rem;
  color: var(--color-text);
}

.no-moves {
  text-align: center;
  color: var(--color-text-secondary);
  font-style: italic;
  padding: 20px;
}

@media (max-width: 1200px) {
  .game-area {
    grid-template-columns: 1fr;
  }
  
  .phaser-container {
    min-height: 500px;
  }
}

@media (max-width: 768px) {
  .lobby-container {
    grid-template-columns: 1fr;
  }
  
  .app-header h1 {
    font-size: 2rem;
  }
  
  .connection-status-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  
  .status-item {
    justify-content: space-between;
  }
  
  .board-row {
    grid-template-columns: repeat(8, 30px);
  }
  
  .board-square {
    width: 30px;
    height: 30px;
  }
}
</style>
