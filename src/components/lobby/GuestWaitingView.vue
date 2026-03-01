<template>
  <div class="guest-waiting-view">
    <div class="header">
      <h2>Esperando al Host</h2>
      <p class="subtitle">Te has unido al juego como invitado</p>
    </div>

    <div class="content">
      <!-- Información del host -->
      <div class="host-info-card">
        <div class="info-section">
          <h3>Información del Juego</h3>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Tu Token:</span>
              <div class="token-display">
                <code class="token-value">{{ connectionStore.token }}</code>
              </div>
            </div>
            
            <div class="info-item">
              <span class="info-label">Host:</span>
              <div class="host-display">
                <code class="host-token">{{ connectionStore.subscribedHost }}</code>
                <span class="host-status" :class="hostStatusClass">
                  {{ hostStatusText }}
                </span>
              </div>
            </div>
            
            <div class="info-item">
              <span class="info-label">Estado:</span>
              <span class="info-value status-badge waiting">
                Esperando inicio
              </span>
            </div>
          </div>
          
          <p class="help-text">
            Esperando a que el host inicie el juego. El juego comenzará automáticamente cuando el host haga clic en "Iniciar Juego".
          </p>
        </div>
      </div>

      <!-- Mensaje de espera -->
      <div class="waiting-message">
        <div class="waiting-icon">⏳</div>
        <h3>Esperando que el host inicie el juego...</h3>
        <p>
          El host <strong>{{ connectionStore.subscribedHost }}</strong> debe iniciar el juego.
          Una vez que lo haga, el juego comenzará automáticamente.
        </p>
        <div class="waiting-tips">
          <p><strong>Consejos:</strong></p>
          <ul>
            <li>Asegúrate de tener una conexión estable a internet</li>
            <li>El juego puede tardar unos segundos en comenzar después de que el host lo inicie</li>
            <li>Si el host se desconecta, serás redirigido al lobby automáticamente</li>
          </ul>
        </div>
      </div>

      <!-- Controles -->
      <div class="controls">
        <button 
          @click="disconnect"
          class="disconnect-button"
          :disabled="isDisconnecting"
        >
          <span v-if="isDisconnecting">Desconectando...</span>
          <span v-else>Desconectar</span>
        </button>
        
        <p class="disconnect-help">
          Si necesitas salir del juego, haz clic en "Desconectar" para volver al lobby.
        </p>
      </div>
    </div>

    <!-- Notificaciones -->
    <div v-if="notification" class="notification" :class="notification.type">
      <span>{{ notification.message }}</span>
      <button @click="clearNotification" class="dismiss-button">×</button>
    </div>

    <!-- Estado de carga -->
    <div v-if="isDisconnecting" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>Desconectando...</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useConnectionStore } from '@/stores/connectionStore'

const connectionStore = useConnectionStore()

// Estado local
const isDisconnecting = ref(false)
const notification = ref(null)
const hostConnected = ref(true)

// Computed
const hostStatusText = computed(() => {
  return hostConnected.value ? 'Conectado' : 'Desconectado'
})

const hostStatusClass = computed(() => {
  return hostConnected.value ? 'connected' : 'disconnected'
})

// Métodos
const disconnect = async () => {
  if (isDisconnecting.value) return
  
  isDisconnecting.value = true
  
  try {
    // Desuscribirse primero
    await connectionStore.unsubscribe()
    
    // Cambiar a modo null para volver al lobby
    await connectionStore.setMode(null)
    
    // El cambio a la vista de lobby se manejará en App.vue
  } catch (error) {
    console.error('Error disconnecting:', error)
    showNotification('error', `Error al desconectar: ${error.message}`)
    isDisconnecting.value = false
  }
}

const showNotification = (type, message) => {
  notification.value = { type, message }
  
  // Auto-ocultar después de 5 segundos
  setTimeout(() => {
    if (notification.value && notification.value.message === message) {
      clearNotification()
    }
  }, 5000)
}

const clearNotification = () => {
  notification.value = null
}

const handleHostDisconnected = () => {
  hostConnected.value = false
  showNotification('error', `El host se ha desconectado. Serás redirigido al lobby.`)
  
  // Redirigir al lobby después de 3 segundos
  setTimeout(() => {
    disconnect()
  }, 3000)
}

const handleGameStart = (data) => {
  showNotification('success', '¡El juego ha comenzado!')
  // El cambio a la vista de juego se manejará en App.vue
  // basado en el cambio de estado en gameStore
}

// Lifecycle hooks
onMounted(() => {
  // Observar cambios en el host suscrito para detectar desconexiones
  watch(() => connectionStore.subscribedHost, (newHost, oldHost) => {
    if (oldHost && !newHost) {
      // Host desconectado
      handleHostDisconnected()
    }
  })
  
  // Observar mensajes recibidos para detectar inicio de juego
  // Los mensajes de juego serán manejados por los stores de juego
  // Este componente solo necesita detectar cuando el juego comienza
  // lo cual se manejará en App.vue basado en el estado del gameStore
})

onUnmounted(() => {
  // No se necesitan limpiar listeners ya que watch se limpia automáticamente
})
</script>

<style scoped>
.guest-waiting-view {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  text-align: center;
  margin-bottom: 30px;
}

.header h2 {
  margin: 0 0 10px 0;
  color: var(--color-text);
}

.subtitle {
  color: var(--color-text-secondary);
  margin: 0;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.host-info-card,
.waiting-message,
.controls {
  background: var(--color-card-bg);
  border-radius: 10px;
  padding: 20px;
  box-shadow: var(--shadow-sm);
}

.info-section h3,
.waiting-message h3 {
  margin-top: 0;
  margin-bottom: 15px;
  color: var(--color-text);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 15px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.info-label {
  font-weight: bold;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.info-value {
  font-size: 16px;
  color: var(--color-text);
}

.token-display,
.host-display {
  display: flex;
  align-items: center;
  gap: 10px;
}

.token-value,
.host-token {
  font-family: monospace;
  background: var(--color-surface-variant);
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 16px;
  flex: 1;
}

.host-status {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: bold;
}

.host-status.connected {
  background: rgba(52, 206, 87, 0.15);
  color: var(--color-success-dark);
  border: 1px solid #c3e6cb;
}

.host-status.disconnected {
  background: rgba(231, 76, 60, 0.15);
  color: var(--color-error-dark);
  border: 1px solid #f5c6cb;
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: bold;
}

.status-badge.waiting {
  background: rgba(255, 212, 59, 0.15);
  color: var(--color-warning-dark);
  border: 1px solid #ffeaa7;
}

.help-text {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 10px 0 0 0;
  line-height: 1.5;
}

.waiting-message {
  text-align: center;
}

.waiting-icon {
  font-size: 60px;
  margin-bottom: 20px;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 0.7; }
  50% { opacity: 1; }
  100% { opacity: 0.7; }
}

.waiting-message h3 {
  color: var(--color-text);
  margin-bottom: 10px;
}

.waiting-message p {
  color: var(--color-text-secondary);
  line-height: 1.6;
  max-width: 600px;
  margin: 0 auto 20px auto;
}

.waiting-tips {
  text-align: left;
  background: var(--color-surface);
  padding: 15px;
  border-radius: 8px;
  border: 1px solid #dee2e6;
  margin-top: 20px;
}

.waiting-tips p {
  margin: 0 0 10px 0;
  font-weight: bold;
  color: var(--color-text);
}

.waiting-tips ul {
  margin: 0;
  padding-left: 20px;
  color: var(--color-text-secondary);
}

.waiting-tips li {
  margin-bottom: 5px;
  line-height: 1.5;
}

.controls {
  text-align: center;
}

.disconnect-button {
  padding: 15px 30px;
  background: var(--color-button-danger);
  color: var(--color-text-on-primary);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  transition: all 0.2s;
  margin-bottom: 15px;
}

.disconnect-button:hover:not(:disabled) {
  background: var(--color-button-danger-hover);
  transform: translateY(-2px);
}

.disconnect-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.disconnect-help {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.5;
}

.notification {
  position: fixed;
  bottom: 20px;
  right: 20px;
  padding: 15px 20px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  max-width: 400px;
  box-shadow: var(--shadow-md);
  z-index: 1000;
  animation: slideIn 0.3s ease-out;
}

.notification.success {
  background: rgba(52, 206, 87, 0.15);
  color: var(--color-success-dark);
  border: 1px solid #c3e6cb;
}

.notification.error {
  background: rgba(231, 76, 60, 0.15);
  color: var(--color-error-dark);
  border: 1px solid #f5c6cb;
}

.notification.info {
  background: rgba(57, 192, 237, 0.15);
  color: #0c5460;
  border: 1px solid #bee5eb;
}

.notification.warning {
  background: rgba(255, 212, 59, 0.15);
  color: var(--color-warning-dark);
  border: 1px solid #ffeaa7;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.dismiss-button {
  background: none;
  border: none;
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
  background: rgba(0, 0, 0, 0.1);
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 5px solid #f3f3f3;
  border-top: 5px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .info-grid {
    grid-template-columns: 1fr;
  }
  
  .token-display,
  .host-display {
    flex-direction: column;
    align-items: stretch;
  }
  
  .host-status {
    align-self: flex-start;
    margin-top: 5px;
  }
}
</style>
