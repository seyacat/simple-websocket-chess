<script setup>
import { ref, computed, watch } from 'vue'
import ConnectionPanel from './components/connection/ConnectionPanel.vue'
import LobbyView from './components/lobby/LobbyView.vue'
import HostGameView from './components/lobby/HostGameView.vue'
import GuestWaitingView from './components/lobby/GuestWaitingView.vue'
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
const currentView = ref('lobby') // 'lobby', 'host-waiting', 'guest-waiting', 'game'

// Computed
const gameTitle = computed(() => {
  if (gameStore.gameStatus === 'playing') {
    return `Ajedrez - Turno: ${gameStore.currentTurn === 'white' ? 'Blancas' : 'Negras'}`
  }
  
  switch (currentView.value) {
    case 'lobby':
      return 'Lobby de Ajedrez'
    case 'host-waiting':
      return 'Esperando Jugadores (Host)'
    case 'guest-waiting':
      return 'Esperando Inicio (Guest)'
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
      return 'Selecciona o crea un juego para comenzar'
    case 'host-waiting':
      return `Host - Token: ${connectionStore.shortToken}`
    case 'guest-waiting':
      return `Guest - Conectado a: ${connectionStore.subscribedHost}`
    default:
      return 'Configura la conexión para comenzar'
  }
})

const canShowGame = computed(() => {
  return connectionStore.isConnected && gameStore.gameStatus !== 'waiting'
})

// Determinar vista actual basada en estado
const determineCurrentView = () => {
  if (!connectionStore.isConnected) {
    currentView.value = 'lobby'
    return
  }

  if (gameStore.gameStatus === 'playing') {
    currentView.value = 'game'
    return
  }

  if (connectionStore.mode === 'host') {
    currentView.value = 'host-waiting'
    return
  }

  if (connectionStore.mode === 'guest') {
    currentView.value = 'guest-waiting'
    return
  }

  currentView.value = 'lobby'
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
    setTimeout(() => {
      connectionStore.setMode(null)
      connectionStore.setSubscribedHost(null)
      determineCurrentView()
    }, 3000)
  }
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
            @click="connectionStore.setMode(null); connectionStore.setSubscribedHost(null); currentView = 'lobby'"
            class="back-to-lobby-button"
          >
            Volver al Lobby
          </button>
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
          <ConnectionPanel />
        </div>
      </div>

      <!-- Vista de Host esperando -->
      <div v-else-if="currentView === 'host-waiting'" class="host-waiting-container">
        <HostGameView />
      </div>

      <!-- Vista de Guest esperando -->
      <div v-else-if="currentView === 'guest-waiting'" class="guest-waiting-container">
        <GuestWaitingView />
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
            <ConnectionPanel class="connection-panel" />
            
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
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.app-header {
  text-align: center;
  margin-bottom: 30px;
  color: white;
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
}

.status-value {
  font-family: monospace;
  background: rgba(0, 0, 0, 0.2);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.9rem;
}

.back-to-lobby-button {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.2);
  color: white;
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
  background: white;
  border-radius: 15px;
  padding: 0;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.connection-status-panel {
  background: white;
  border-radius: 15px;
  padding: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.host-waiting-container,
.guest-waiting-container {
  background: white;
  border-radius: 15px;
  padding: 0;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.game-container {
  background: white;
  border-radius: 15px;
  padding: 30px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.game-area {
  display: grid;
  grid-template-columns: 1fr 350px;
  gap: 30px;
}

.phaser-container {
  background: #2c3e50;
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
  background: rgba(44, 62, 80, 0.95);
}

.placeholder-content {
  text-align: center;
  color: white;
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
  border: 3px solid #34495e;
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
  background: #f0d9b5;
}

.board-square.dark {
  background: #b58863;
}

.control-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.connection-panel {
  background: #f8f9fa;
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.game-info-panel {
  background: #f8f9fa;
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.game-status h4,
.move-history h4 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 1.1rem;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid #dee2e6;
}

.status-item:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.status-label {
  font-weight: bold;
  color: #666;
  font-size: 0.9rem;
}

.status-value {
  font-weight: bold;
  color: #333;
}

.status-value.current-turn {
  color: #28a745;
}

.your-turn {
  font-size: 0.8rem;
  color: #28a745;
  margin-left: 5px;
}

.status-value.winner {
  color: #dc3545;
}

.move-history {
  margin-top: 20px;
}

.history-list {
  max-height: 300px;
  overflow-y: auto;
  background: white;
  border-radius: 5px;
  padding: 10px;
  border: 1px solid #dee2e6;
}

.history-item {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid #f1f1f1;
}

.history-item:last-child {
  border-bottom: none;
}

.move-number {
  font-weight: bold;
  color: #666;
  min-width: 30px;
}

.move-description {
  flex: 1;
  font-family: monospace;
  font-size: 0.9rem;
}

.no-moves {
  text-align: center;
  color: #666;
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
