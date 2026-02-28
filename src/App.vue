<script setup>
import { ref, computed } from 'vue'
import ConnectionPanel from './components/connection/ConnectionPanel.vue'
import PhaserChessGame from './components/chess/PhaserChessGame.vue'
import { useGameStore } from './stores/gameStore'
import { useConnectionStore } from './stores/connectionStore'

// Stores
const gameStore = useGameStore()
const connectionStore = useConnectionStore()

// Estado local
const showGameControls = ref(true)
const boardSize = ref(600)

// Computed
const gameTitle = computed(() => {
  if (gameStore.gameStatus === 'playing') {
    return `Ajedrez - Turno: ${gameStore.currentTurn === 'white' ? 'Blancas' : 'Negras'}`
  }
  return 'Ajedrez con WebSocket'
})

const playerInfo = computed(() => {
  if (gameStore.gameStatus === 'playing') {
    return `Eres las ${gameStore.playerColor === 'white' ? 'blancas' : 'negras'} ${gameStore.isHost ? '(Host)' : '(Guest)'}`
  }
  return 'Configura la conexión para comenzar'
})

const canShowGame = computed(() => {
  return connectionStore.isConnected && gameStore.gameStatus !== 'waiting'
})
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <h1>{{ gameTitle }}</h1>
      <p class="subtitle">{{ playerInfo }}</p>
    </header>

    <main class="app-main">
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
              <p>Conéctate al servidor y configura una partida para ver el tablero.</p>
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
                  :class="{ 'remote-move': move.isRemote }"
                >
                  <span class="move-number">{{ gameStore.moveHistory.length - index }}.</span>
                  <span class="move-notation">{{ move.notation }}</span>
                  <span v-if="move.isRemote" class="remote-indicator">(remoto)</span>
                </div>
                <div v-if="gameStore.moveHistory.length === 0" class="no-moves">
                  No hay movimientos aún
                </div>
              </div>
            </div>

            <div class="game-actions">
              <button 
                @click="gameStore.resetGame" 
                class="action-button reset-button"
                :disabled="gameStore.gameStatus === 'waiting'"
              >
                Reiniciar Juego
              </button>
              <button 
                @click="gameStore.surrender" 
                class="action-button surrender-button"
                :disabled="gameStore.gameStatus !== 'playing'"
              >
                Rendirse
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <footer class="app-footer">
      <div class="footer-content">
        <p class="footer-info">
          <strong>Ajedrez con WebSocket</strong> - Conéctate como host o guest para jugar.
          Servidor: {{ connectionStore.wsUrl }}
        </p>
        <div class="footer-links">
          <button 
            @click="showGameControls = !showGameControls" 
            class="footer-button"
          >
            {{ showGameControls ? 'Ocultar controles' : 'Mostrar controles' }}
          </button>
          <button 
            @click="boardSize = boardSize === 600 ? 800 : 600" 
            class="footer-button"
            v-if="canShowGame"
          >
            Tamaño: {{ boardSize }}px
          </button>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.app-header {
  background: rgba(255, 255, 255, 0.95);
  padding: 20px 30px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.app-header h1 {
  margin: 0;
  color: #333;
  font-size: 28px;
  font-weight: 700;
}

.subtitle {
  margin: 8px 0 0 0;
  color: #666;
  font-size: 16px;
}

.app-main {
  flex: 1;
  padding: 30px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.game-area {
  display: flex;
  gap: 30px;
  max-width: 1400px;
  width: 100%;
  flex-wrap: wrap;
}

.phaser-container {
  flex: 1;
  min-width: 300px;
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
  transition: all 0.3s ease;
}

.phaser-container.game-active {
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
}

.chess-game {
  width: 100%;
  height: 100%;
  min-height: 600px;
}

.game-placeholder {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 600px;
  padding: 40px;
  background: #f8f9fa;
}

.placeholder-content {
  text-align: center;
  max-width: 400px;
}

.placeholder-content h3 {
  margin: 0 0 16px 0;
  color: #333;
  font-size: 24px;
}

.placeholder-content p {
  margin: 0 0 30px 0;
  color: #666;
  line-height: 1.5;
}

.placeholder-board {
  display: inline-block;
  border: 4px solid #333;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.board-grid {
  display: flex;
  flex-direction: column;
  width: 240px;
  height: 240px;
}

.board-row {
  display: flex;
  flex: 1;
}

.board-square {
  flex: 1;
  transition: background 0.2s;
}

.board-square.light {
  background: #f0d9b5;
}

.board-square.dark {
  background: #b58863;
}

.control-panel {
  width: 350px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.connection-panel {
  flex-shrink: 0;
}

.game-info-panel {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.game-status,
.move-history {
  margin-bottom: 25px;
}

.game-status h4,
.move-history h4 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 18px;
  padding-bottom: 8px;
  border-bottom: 1px solid #eee;
}

.status-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed #f0f0f0;
}

.status-item:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.status-label {
  font-weight: 500;
  color: #666;
}

.status-value {
  font-weight: 600;
  color: #333;
}

.status-value.current-turn {
  color: #2196f3;
}

.your-turn {
  font-size: 12px;
  background: #2196f3;
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
  margin-left: 6px;
}

.status-value.winner {
  color: #4caf50;
}

.history-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 10px;
  background: #fafafa;
}

.history-item {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  margin-bottom: 4px;
  background: white;
  border-radius: 4px;
  border-left: 3px solid #4caf50;
  font-family: 'Courier New', monospace;
}

.history-item.remote-move {
  border-left-color: #2196f3;
  background: #f8fdff;
}

.move-number {
  font-weight: bold;
  color: #666;
  margin-right: 8px;
  min-width: 24px;
}

.move-notation {
  flex: 1;
  color: #333;
}

.remote-indicator {
  font-size: 11px;
  color: #2196f3;
  background: rgba(33, 150, 243, 0.1);
  padding: 2px 6px;
  border-radius: 10px;
  margin-left: 8px;
}

.no-moves {
  text-align: center;
  color: #999;
  font-style: italic;
  padding: 20px;
}

.game-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.action-button {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
}

.reset-button {
  background: #ff9800;
  color: white;
}

.reset-button:hover:not(:disabled) {
  background: #f57c00;
}

.reset-button:disabled {
  background: #ffe0b2;
  color: #999;
  cursor: not-allowed;
}

.surrender-button {
  background: #f44336;
  color: white;
}

.surrender-button:hover:not(:disabled) {
  background: #d32f2f;
}

.surrender-button:disabled {
  background: #ffcdd2;
  color: #999;
  cursor: not-allowed;
}

.app-footer {
  background: rgba(255, 255, 255, 0.95);
  padding: 20px 30px;
  border-top: 1px solid #eaeaea;
  margin-top: auto;
}

.footer-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 15px;
  max-width: 1400px;
  margin: 0 auto;
}

.footer-info {
  margin: 0;
  color: #666;
  font-size: 14px;
  flex: 1;
  min-width: 300px;
}

.footer-links {
  display: flex;
  gap: 10px;
}

.footer-button {
  padding: 8px 16px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  color: #333;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.footer-button:hover {
  background: #e8e8e8;
}

/* Responsive */
@media (max-width: 1100px) {
  .game-area {
    flex-direction: column;
  }
  
  .phaser-container,
  .control-panel {
    width: 100%;
  }
  
  .control-panel {
    order: -1;
  }
}

@media (max-width: 768px) {
  .app-main {
    padding: 15px;
  }
  
  .app-header h1 {
    font-size: 22px;
  }
  
  .subtitle {
    font-size: 14px;
  }
  
  .footer-content {
    flex-direction: column;
    text-align: center;
  }
  
  .footer-info {
    min-width: auto;
  }
}
</style>
