<template>
  <div class="lobby-view">
    <div class="lobby-header">
      <h2>Lobby de Ajedrez</h2>
      <p class="subtitle">Conectado como: <strong>{{ connectionStore.shortToken }}</strong></p>
    </div>

    <div class="lobby-content">
      <!-- Sección de creación de juego -->
      <div class="game-creation-section">
        <h3>Crear Nuevo Juego</h3>
        <div class="creation-options">
          <button 
            @click="createPublicGame" 
            class="create-button public-game"
            :disabled="isCreating"
          >
            <span class="button-icon">🌐</span>
            <span class="button-text">
              <strong>Juego Público</strong>
              <small>Visible en la lista para que otros se unan</small>
            </span>
          </button>
          
          <button 
            @click="createPrivateGame" 
            class="create-button private-game"
            :disabled="isCreating"
          >
            <span class="button-icon">🔐</span>
            <span class="button-text">
              <strong>Juego Privado</strong>
              <small>Solo con tu token compartido</small>
            </span>
          </button>
        </div>
      </div>

      <!-- Sección de lista de hosts públicos -->
      <div class="public-hosts-section">
        <div class="section-header">
          <h3>Juegos Públicos Disponibles</h3>
          <div class="refresh-controls">
            <span class="last-update">
              {{ lastUpdateText }}
            </span>
            <button 
              @click="refreshPublicHosts" 
              class="refresh-button"
              :disabled="isRefreshing"
            >
              {{ isRefreshing ? 'Actualizando...' : 'Actualizar' }}
            </button>
          </div>
        </div>

        <div v-if="publicHosts.length === 0" class="empty-state">
          <p>No hay juegos públicos disponibles.</p>
          <p>Crea uno o pide a un amigo que cree un juego público.</p>
        </div>

        <div v-else class="hosts-list">
          <div 
            v-for="host in publicHosts" 
            :key="host.shortToken"
            class="host-card"
          >
            <div class="host-info">
              <div class="host-token">
                <span class="token-label">Host:</span>
                <code class="token-value">{{ host.shortToken }}</code>
              </div>
              <div class="host-stats">
                <span class="stat">
                  <span class="stat-icon">👥</span>
                  {{ host.subscribersCount }} jugador{{ host.subscribersCount !== 1 ? 'es' : '' }}
                </span>
                <span class="stat">
                  <span class="stat-icon">🌐</span>
                  Público
                </span>
              </div>
            </div>
            <button 
              @click="joinGame(host.shortToken)"
              class="join-button"
              :disabled="isJoining"
            >
              Unirse
            </button>
          </div>
        </div>
      </div>

      <!-- Sección de unirse con token manual -->
      <div class="manual-join-section">
        <h3>Unirse con Token</h3>
        <div class="manual-join-form">
          <input
            v-model="manualToken"
            type="text"
            placeholder="Ingresa el token del host (ej: ABC123)"
            class="token-input"
            :disabled="isJoining"
          />
          <button 
            @click="joinWithManualToken"
            class="join-button"
            :disabled="!isValidToken(manualToken) || isJoining"
          >
            {{ isJoining ? 'Uniéndose...' : 'Unirse' }}
          </button>
        </div>
        <p class="help-text">
          Pídele al host que te comparta su token para unirte a su juego privado.
        </p>
      </div>
    </div>

    <!-- Estado de carga -->
    <div v-if="isCreating || isJoining || isRefreshing" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>{{ loadingMessage }}</p>
    </div>

    <!-- Mensajes de error -->
    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}
      <button @click="clearError" class="dismiss-button">×</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useConnectionStore } from '@/stores/connectionStore'
import { getWebSocketService } from '@/services/WebSocketService'

const connectionStore = useConnectionStore()
const wsService = getWebSocketService()

// Estado local
const isCreating = ref(false)
const isJoining = ref(false)
const isRefreshing = ref(false)
const manualToken = ref('')
const errorMessage = ref('')
const refreshInterval = ref(null)

// Computed
const publicHosts = computed(() => connectionStore.publicHosts)
const lastUpdateText = computed(() => {
  if (!connectionStore.lastPublicHostsUpdate) return 'Nunca actualizado'
  
  const now = Date.now()
  const diff = now - connectionStore.lastPublicHostsUpdate
  const seconds = Math.floor(diff / 1000)
  
  if (seconds < 60) return `Hace ${seconds} segundos`
  if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} minutos`
  return `Hace ${Math.floor(seconds / 3600)} horas`
})

const loadingMessage = computed(() => {
  if (isCreating.value) return 'Creando juego...'
  if (isJoining.value) return 'Uniéndose al juego...'
  if (isRefreshing.value) return 'Actualizando lista...'
  return ''
})

// Métodos
const isValidToken = (token) => {
  return token && token.trim().length >= 4 && /^[A-Za-z0-9]+$/.test(token.trim())
}

const createPublicGame = async () => {
  if (isCreating.value) return
  
  isCreating.value = true
  errorMessage.value = ''
  
  try {
    await wsService.setMode('host', 'public')
    // La transición a la vista de host-waiting se manejará en App.vue
    // basado en el cambio de estado en connectionStore
  } catch (error) {
    errorMessage.value = `Error al crear juego público: ${error.message}`
    console.error('Error creating public game:', error)
  } finally {
    isCreating.value = false
  }
}

const createPrivateGame = async () => {
  if (isCreating.value) return
  
  isCreating.value = true
  errorMessage.value = ''
  
  try {
    await wsService.setMode('host', 'private')
    // La transición a la vista de host-waiting se manejará en App.vue
  } catch (error) {
    errorMessage.value = `Error al crear juego privado: ${error.message}`
    console.error('Error creating private game:', error)
  } finally {
    isCreating.value = false
  }
}

const joinGame = async (hostToken) => {
  if (isJoining.value) return
  
  isJoining.value = true
  errorMessage.value = ''
  
  try {
    // Primero establecer modo guest
    await wsService.setMode('guest')
    
    // Luego suscribirse al host
    await wsService.subscribeToHost(hostToken)
    
    // La transición a la vista de guest-waiting se manejará en App.vue
  } catch (error) {
    errorMessage.value = `Error al unirse al juego: ${error.message}`
    console.error('Error joining game:', error)
    // Revertir modo si falla
    await wsService.setMode(null)
  } finally {
    isJoining.value = false
  }
}

const joinWithManualToken = async () => {
  const token = manualToken.value.trim()
  if (!isValidToken(token)) {
    errorMessage.value = 'Token inválido. Debe tener al menos 4 caracteres alfanuméricos.'
    return
  }
  
  await joinGame(token)
}

const refreshPublicHosts = async () => {
  if (isRefreshing.value) return
  
  isRefreshing.value = true
  errorMessage.value = ''
  
  try {
    await wsService.listPublicHosts()
  } catch (error) {
    errorMessage.value = `Error al actualizar lista: ${error.message}`
    console.error('Error refreshing public hosts:', error)
  } finally {
    isRefreshing.value = false
  }
}

const clearError = () => {
  errorMessage.value = ''
}

const startAutoRefresh = () => {
  // Refrescar cada X segundos (por defecto 20000 ms = 20 segundos)
  const refreshIntervalMs = parseInt(import.meta.env.VITE_WS_LOBBY_REFRESH_INTERVAL) || 20000
  refreshInterval.value = setInterval(() => {
    if (!isRefreshing.value && connectionStore.isConnected) {
      refreshPublicHosts()
    }
  }, refreshIntervalMs)
}

const stopAutoRefresh = () => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
    refreshInterval.value = null
  }
}

// Lifecycle hooks
onMounted(() => {
  // Cargar lista inicial de hosts públicos
  if (connectionStore.isConnected) {
    refreshPublicHosts()
    startAutoRefresh()
  }
  
  // Escuchar cambios en conexión para manejar auto-refresh
  const unsubscribe = connectionStore.$subscribe(() => {
    if (connectionStore.isConnected && !refreshInterval.value) {
      refreshPublicHosts()
      startAutoRefresh()
    } else if (!connectionStore.isConnected && refreshInterval.value) {
      stopAutoRefresh()
    }
  })
  
  // Cleanup subscription
  onUnmounted(() => {
    unsubscribe()
    stopAutoRefresh()
  })
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<style scoped>
.lobby-view {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.lobby-header {
  text-align: center;
  margin-bottom: 30px;
}

.lobby-header h2 {
  margin: 0 0 10px 0;
  color: var(--color-text);
}

.subtitle {
  color: var(--color-text-secondary);
  margin: 0;
}
</style>
.lobby-content {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.game-creation-section,
.public-hosts-section,
.manual-join-section {
  background: var(--color-card-bg);
  border-radius: 10px;
  padding: 20px;
  box-shadow: var(--shadow-sm);
}

.game-creation-section h3,
.public-hosts-section h3,
.manual-join-section h3 {
  margin-top: 0;
  margin-bottom: 15px;
  color: var(--color-text);
}

.creation-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

.create-button {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 20px;
  border: 2px solid transparent;
  border-radius: 8px;
  background: var(--color-surface);
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.create-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.create-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.public-game {
  border-color: var(--color-success);
}

.public-game:hover:not(:disabled) {
  background: rgba(76, 175, 80, 0.1);
}

.private-game {
  border-color: var(--color-info);
}

.private-game:hover:not(:disabled) {
  background: rgba(33, 150, 243, 0.1);
}

.button-icon {
  font-size: 24px;
}

.button-text {
  display: flex;
  flex-direction: column;
}

.button-text strong {
  font-size: 16px;
  color: var(--color-text);
  margin-bottom: 5px;
}

.button-text small {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.refresh-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.last-update {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.refresh-button {
  padding: 5px 15px;
  background: var(--color-button-secondary);
  color: var(--color-text-on-primary);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.refresh-button:hover:not(:disabled) {
  background: var(--color-button-secondary-hover);
}

.refresh-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--color-text-secondary);
}

.empty-state p {
  margin: 5px 0;
}

.hosts-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.host-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  background: var(--color-surface);
  border-radius: 8px;
  border: 1px solid var(--color-border);
}

.host-info {
  flex: 1;
}

.host-token {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.token-label {
  font-weight: bold;
  color: var(--color-text);
}

.token-value {
  font-family: monospace;
  background: var(--color-surface-variant);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 14px;
}

.host-stats {
  display: flex;
  gap: 15px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.stat-icon {
  font-size: 16px;
}

.join-button {
  padding: 8px 20px;
  background: var(--color-button-success);
  color: var(--color-text-on-primary);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

.join-button:hover:not(:disabled) {
  background: var(--color-button-success-hover);
}

.join-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.manual-join-form {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.token-input {
  flex: 1;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 16px;
}

.token-input:focus {
  outline: none;
  border-color: var(--color-primary-light);
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

.help-text {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-overlay-light);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 5px solid var(--color-surface);
  border-top: 5px solid var(--color-info);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: var(--color-button-danger);
  color: var(--color-text-on-primary);
  padding: 15px 20px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  max-width: 400px;
  box-shadow: var(--shadow-md);
  z-index: 1000;
}

.dismiss-button {
  background: none;
  border: none;
  color: var(--color-text-on-primary);
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.dismiss-button:hover {
  background: rgba(255, 255, 255, 0.2);
}

@media (max-width: 768px) {
  .creation-options {
    grid-template-columns: 1fr;
  }
  
  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .refresh-controls {
    width: 100%;
    justify-content: space-between;
  }
  
  .host-card {
    flex-direction: column;
    gap: 15px;
    align-items: stretch;
  }
  .join-button {
    align-self: flex-end;
  }
}
  

