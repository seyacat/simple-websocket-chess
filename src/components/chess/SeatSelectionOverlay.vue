<template>
  <div class="seat-selection-overlay">
    <!-- Encabezado -->
    <div class="overlay-header">
      <h3>Sistema de Asientos</h3>
      <div class="game-status" :class="gameStatus">
        {{ statusText }}
      </div>
    </div>
    
    <!-- Asientos -->
    <div class="seats-container">
      <!-- Asiento Blancas -->
      <div class="seat-card" :class="{ occupied: seats.white.occupied, available: !seats.white.occupied, myseat: isMySeat('white') }">
        <div class="seat-header">
          <div class="seat-color white"></div>
          <h4>Blancas</h4>
          <span class="seat-status">
            {{ seats.white.occupied ? 'Ocupado' : 'Disponible' }}
          </span>
        </div>
        
        <div class="seat-info">
          <div v-if="seats.white.occupied" class="player-info">
            <span class="player-icon">👤</span>
            <span class="player-name">{{ seats.white.playerName || 'Jugador' }}</span>
          </div>
          <div v-else class="empty-seat">
            <span>Asiento vacío</span>
          </div>
        </div>
        
        <div class="seat-actions">
          <button 
            v-if="!seats.white.occupied && !isSeated"
            @click="takeSeat('white')"
            class="take-seat-btn"
            :disabled="isTakingSeat"
          >
            {{ isTakingSeat ? 'Ocupando...' : 'Ocupar Asiento' }}
          </button>
          
          <button 
            v-else-if="isMySeat('white')"
            @click="leaveSeat"
            class="leave-seat-btn"
            :disabled="isLeavingSeat"
          >
            {{ isLeavingSeat ? 'Dejando...' : 'Dejar Asiento' }}
          </button>
          
          <div v-else-if="seats.white.occupied" class="occupied-message">
            Ocupado por otro jugador
          </div>
        </div>
      </div>
      
      <!-- Asiento Negras -->
      <div class="seat-card" :class="{ occupied: seats.black.occupied, available: !seats.black.occupied, myseat: isMySeat('black') }">
        <div class="seat-header">
          <div class="seat-color black"></div>
          <h4>Negras</h4>
          <span class="seat-status">
            {{ seats.black.occupied ? 'Ocupado' : 'Disponible' }}
          </span>
        </div>
        
        <div class="seat-info">
          <div v-if="seats.black.occupied" class="player-info">
            <span class="player-icon">👤</span>
            <span class="player-name">{{ seats.black.playerName || 'Jugador' }}</span>
          </div>
          <div v-else class="empty-seat">
            <span>Asiento vacío</span>
          </div>
        </div>
        
        <div class="seat-actions">
          <button 
            v-if="!seats.black.occupied && !isSeated"
            @click="takeSeat('black')"
            class="take-seat-btn"
            :disabled="isTakingSeat"
          >
            {{ isTakingSeat ? 'Ocupando...' : 'Ocupar Asiento' }}
          </button>
          
          <button 
            v-else-if="isMySeat('black')"
            @click="leaveSeat"
            class="leave-seat-btn"
            :disabled="isLeavingSeat"
          >
            {{ isLeavingSeat ? 'Dejando...' : 'Dejar Asiento' }}
          </button>
          
          <div v-else-if="seats.black.occupied" class="occupied-message">
            Ocupado por otro jugador
          </div>
        </div>
      </div>
    </div>
    
    <!-- Información del jugador -->
    <div class="player-info-card">
      <div class="info-row">
        <span class="info-label">Tu estado:</span>
        <span class="info-value" :class="playerStatusClass">
          {{ playerStatusText }}
        </span>
      </div>
      
      <div v-if="isSeated" class="info-row">
        <span class="info-label">Tu asiento:</span>
        <span class="info-value seat-color-indicator" :class="mySeatColor">
          {{ mySeatColor === 'white' ? 'Blancas' : 'Negras' }}
        </span>
      </div>
      
      <div class="info-row">
        <span class="info-label">Espectadores:</span>
        <span class="info-value">
          {{ spectatorsCount }} 👁️
        </span>
      </div>
    </div>
    
    <!-- Mensajes del juego -->
    <div v-if="gameStatus === 'paused'" class="game-message paused">
      <p>⏸️ Juego en pausa - Esperando segundo jugador</p>
      <p class="message-sub">Un jugador abandonó el asiento. El juego continuará cuando alguien ocupe el asiento vacío.</p>
    </div>
    
    <div v-if="gameStatus === 'waiting' && !bothSeatsOccupied" class="game-message waiting">
      <p>⏳ Esperando jugadores</p>
      <p class="message-sub">El juego comenzará automáticamente cuando ambos asientos estén ocupados.</p>
    </div>
    
    <div v-if="gameStatus === 'playing'" class="game-message playing">
      <p>🎮 Juego en progreso</p>
      <p class="message-sub">Turno actual: {{ currentTurn === 'white' ? 'Blancas' : 'Negras' }}</p>
    </div>
    
    <!-- Instrucciones -->
    <div class="instructions">
      <p><strong>Instrucciones:</strong></p>
      <ul>
        <li>Haz clic en "Ocupar Asiento" para jugar como Blancas o Negras</li>
        <li>Los espectadores pueden ver el juego pero no mover piezas</li>
        <li>Puedes dejar tu asiento en cualquier momento para convertirte en espectador</li>
        <li>El juego comienza automáticamente cuando ambos asientos están ocupados</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { useConnectionStore } from '@/stores/connectionStore'

const gameStore = useGameStore()
const connectionStore = useConnectionStore()

// Estado local
const isTakingSeat = ref(false)
const isLeavingSeat = ref(false)

// Computed properties
const seats = computed(() => gameStore.seats)
const isSeated = computed(() => gameStore.isSeated)
const mySeatColor = computed(() => gameStore.mySeatColor)
const spectatorsCount = computed(() => gameStore.spectatorsCount)
const bothSeatsOccupied = computed(() => gameStore.bothSeatsOccupied)
const gameStatus = computed(() => gameStore.gameStatus)
const currentTurn = computed(() => gameStore.currentTurn)

const statusText = computed(() => {
  switch (gameStatus.value) {
    case 'waiting': return 'Esperando jugadores'
    case 'playing': return 'Juego en progreso'
    case 'paused': return 'Juego en pausa'
    case 'check': return '¡Jaque!'
    case 'checkmate': return '¡Jaque mate!'
    case 'finished': return 'Juego terminado'
    default: return 'Preparando...'
  }
})

const playerStatusText = computed(() => {
  if (isSeated.value) {
    return `Jugador (${mySeatColor.value === 'white' ? 'Blancas' : 'Negras'})`
  } else if (gameStore.isSpectator) {
    return 'Espectador'
  } else {
    return 'Sin asiento'
  }
})

const playerStatusClass = computed(() => {
  if (isSeated.value) return 'player-status-seated'
  if (gameStore.isSpectator) return 'player-status-spectator'
  return 'player-status-none'
})

// Métodos
function isMySeat(color) {
  return isSeated.value && mySeatColor.value === color
}

async function takeSeat(color) {
  if (isTakingSeat.value || isSeated.value) return
  
  isTakingSeat.value = true
  try {
    const success = await gameStore.takeSeat(color)
    if (!success) {
      console.error('No se pudo ocupar el asiento')
    }
  } catch (error) {
    console.error('Error ocupando asiento:', error)
  } finally {
    isTakingSeat.value = false
  }
}

async function leaveSeat() {
  if (isLeavingSeat.value || !isSeated.value) return
  
  isLeavingSeat.value = true
  try {
    const success = await gameStore.leaveSeat()
    if (!success) {
      console.error('No se pudo dejar el asiento')
    }
  } catch (error) {
    console.error('Error dejando asiento:', error)
  } finally {
    isLeavingSeat.value = false
  }
}
</script>

<style scoped>
.seat-selection-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-overlay-dark);
  color: var(--color-text-on-primary);
  padding: 20px;
  display: flex;
  flex-direction: column;
  z-index: 1000;
  overflow-y: auto;
}

.overlay-header {
  text-align: center;
  margin-bottom: 30px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.overlay-header h3 {
  margin: 0 0 10px 0;
  font-size: 24px;
  color: var(--color-text-on-primary);
}

.game-status {
  display: inline-block;
  padding: 5px 15px;
  border-radius: 20px;
  font-weight: bold;
  font-size: 14px;
}

.game-status.waiting {
  background: var(--color-warning);
  color: var(--color-text);
}

.game-status.playing {
  background: var(--color-success);
  color: var(--color-text-on-primary);
}

.game-status.paused {
  background: var(--color-info);
  color: var(--color-text-on-primary);
}

.game-status.check {
  background: var(--color-error);
  color: var(--color-text-on-primary);
}

.game-status.checkmate {
  background: var(--color-error);
  color: var(--color-text-on-primary);
}

.seats-container {
  display: flex;
  justify-content: center;
  gap: 30px;
  margin-bottom: 30px;
  flex-wrap: wrap;
}

.seat-card {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 20px;
  width: 250px;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
  border: 2px solid transparent;
}

.seat-card.available {
  border-color: var(--color-success);
}

.seat-card.occupied {
  border-color: var(--color-error);
}

.seat-card.myseat {
  border-color: var(--color-info);
  box-shadow: 0 0 15px rgba(33, 150, 243, 0.5);
}

.seat-header {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.seat-color {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  margin-right: 10px;
}

.seat-color.white {
  background: linear-gradient(135deg, #f5f5f5, #bdbdbd);
  border: 1px solid #9e9e9e;
}

.seat-color.black {
  background: linear-gradient(135deg, #424242, #212121);
  border: 1px solid #000;
}

.seat-header h4 {
  margin: 0;
  flex-grow: 1;
  font-size: 18px;
}

.seat-status {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
}

.seat-info {
  flex-grow: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 15px 0;
}

.player-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.player-icon {
  font-size: 24px;
}

.player-name {
  font-weight: bold;
  font-size: 16px;
}

.empty-seat {
  color: rgba(255, 255, 255, 0.5);
  font-style: italic;
}

.seat-actions {
  margin-top: auto;
}

.take-seat-btn, .leave-seat-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 5px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
}

.take-seat-btn {
  background: var(--color-success);
  color: var(--color-text-on-primary);
}

.take-seat-btn:hover:not(:disabled) {
  background: #45a049;
}

.take-seat-btn:disabled {
  background: #666;
  cursor: not-allowed;
}

.leave-seat-btn {
  background: var(--color-warning);
  color: var(--color-text-on-primary);
}

.leave-seat-btn:hover:not(:disabled) {
  background: #f57c00;
}

.leave-seat-btn:disabled {
  background: #666;
  cursor: not-allowed;
}

.occupied-message {
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-style: italic;
  padding: 10px;
}

.player-info-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 20px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.info-row:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.info-label {
  color: rgba(255, 255, 255, 0.7);
}

.info-value {
  font-weight: bold;
}

.player-status-seated {
  color: #4caf50;
}

.player-status-spectator {
  color: #2196f3;
}

.player-status-none {
  color: #ff9800;
}

.seat-color-indicator {
  padding: 3px 10px;
  border-radius: 15px;
  font-size: 12px;
}

.seat-color-indicator.white {
  background: rgba(255, 255, 255, 0.9);
  color: var(--color-text);
}

.seat-color-indicator.black {
  background: rgba(0, 0, 0, 0.9);
  color: var(--color-text-on-primary);
}

.game-message {
  padding: 15px;
  border-radius: 10px;
  margin-bottom: 20px;
  text-align: center;
}

.game-message.paused {
  background: rgba(33, 150, 243, 0.2);
  border: 1px solid #2196f3;
}

.game-message.waiting {
  background: rgba(255, 152, 0, 0.2);
  border: 1px solid #ff9800;
}

.game-message.playing {
  background: rgba(76, 175, 80, 0.2);
  border: 1px solid #4caf50;
}

.game-message p {
  margin: 0 0 5px 0;
  font-weight: bold;
}

.message-sub {
  font-size: 14px;
  opacity: 0.8;
  margin: 0;
}

.instructions {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  padding: 15px;
  margin-top: 20px;
  font-size: 14px;
}

.instructions p {
  margin: 0 0 10px 0;
}

.instructions ul {
  margin: 0;
  padding-left: 20px;
}

.instructions li {
  margin-bottom: 5px;
  line-height: 1.4;
}

.instructions li:last-child {
  margin-bottom: 0;
}

/* Responsive */
@media (max-width: 768px) {
  .seats-container {
    flex-direction: column;
    align-items: center;
  }
  
  .seat-card {
    width: 100%;
    max-width: 300px;
  }
}
</style>
