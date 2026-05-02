<template>
  <div v-if="info" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <button class="close-btn" @click="$emit('close')" aria-label="Close">×</button>

      <h3 class="modal-title">{{ displayName }}</h3>
      <div class="modal-token">Token: <code>{{ info.token }}</code></div>

      <div v-if="!info.pubkey" class="muted">
        Esperando verificación de identidad…
      </div>

      <template v-else>
        <div class="row">
          <label>Nickname personalizado</label>
          <input v-model="customNickname" type="text" maxlength="40"
                 placeholder="Sobrescribe el nickname público" />
        </div>

        <div class="row">
          <label>Calificación</label>
          <div class="stars">
            <button v-for="n in 5" :key="n" type="button" class="star"
                    :class="{ active: n <= rating }"
                    @click="rating = n">★</button>
            <button type="button" class="clear" v-if="rating > 0"
                    @click="rating = 0">limpiar</button>
          </div>
        </div>

        <div class="row">
          <label>Notas</label>
          <textarea v-model="notes" rows="3" maxlength="500"
                    placeholder="Anotaciones privadas (no se comparten)"></textarea>
        </div>

        <div class="actions">
          <button class="primary" @click="save" :disabled="saving">
            {{ saving ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>

        <div v-if="endorsements.length > 0" class="endorsements">
          <h4>Opiniones de personas que tú calificas</h4>
          <ul>
            <li v-for="e in endorsements" :key="e.ratedBy">
              <span class="endorsement-rating">★ {{ e.rating }}</span>
              <span class="endorsement-from">de {{ endorserName(e.ratedBy) }}</span>
              <span v-if="e.notes" class="endorsement-notes">— {{ e.notes }}</span>
            </li>
          </ul>
        </div>

        <div v-if="suspicion" class="suspicion">
          ⚠ Te ha consultado por {{ suspicion.queriesMade }} personas; conocías
          {{ suspicion.queriesKnown }}.
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useConnectionStore } from '@/stores/connectionStore'

const props = defineProps({
  /** { token, pubkey, peer, nickname } */
  info: { type: Object, default: null }
})
const emit = defineEmits(['close'])

const connectionStore = useConnectionStore()

const rating = ref(0)
const notes = ref('')
const customNickname = ref('')
const saving = ref(false)

const displayName = computed(() => props.info?.peer?.nickname || props.info?.nickname || props.info?.token || '')

const endorsements = computed(() => {
  const list = props.info?.peer?.endorsements
  if (!Array.isArray(list)) return []
  return list.filter(e => connectionStore.trustMap.has(e.ratedBy))
})

const suspicion = computed(() => {
  const stats = props.info?.peer?.queryStats
  if (!stats) return null
  if ((stats.queriesMade || 0) < 5) return null
  const ratio = (stats.queriesKnown || 0) / stats.queriesMade
  if (ratio >= 0.2) return null
  return stats
})

const endorserName = (pubkey) => {
  for (const [, info] of connectionStore.peerIdentities) {
    if (info.pubkey === pubkey) return info.peer?.nickname || pubkey.slice(0, 12) + '…'
  }
  return pubkey.length > 32 ? pubkey.slice(0, 12) + '…' : pubkey
}

watch(() => props.info, (info) => {
  if (info?.peer) {
    rating.value = info.peer.myRating?.rating || info.peer.rating || 0
    notes.value = info.peer.myRating?.notes || info.peer.notes || ''
    customNickname.value = info.peer.nickname || ''
  } else {
    rating.value = 0; notes.value = ''; customNickname.value = ''
  }
}, { immediate: true })

const save = async () => {
  if (!props.info?.pubkey) return
  saving.value = true
  try {
    if (customNickname.value.trim()) {
      await connectionStore.setPeerNickname(props.info.pubkey, customNickname.value.trim())
    }
    await connectionStore.ratePeer(props.info.pubkey, rating.value, notes.value || undefined)
    emit('close')
  } catch (e) {
    alert('No se pudo guardar: ' + (e.message || e))
  } finally { saving.value = false }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; padding: 1rem;
}
.modal {
  background: var(--color-card-bg); color: var(--color-text);
  border-radius: 10px; padding: 1.25rem;
  width: 100%; max-width: 420px; box-shadow: var(--shadow-lg);
  position: relative; max-height: 90vh; overflow-y: auto;
}
.close-btn {
  position: absolute; top: 0.5rem; right: 0.5rem;
  background: transparent; border: none; font-size: 1.5rem;
  color: var(--color-text-secondary); cursor: pointer; padding: 0.25rem 0.5rem;
}
.modal-title { margin: 0 0 0.25rem; }
.modal-token { color: var(--color-text-secondary); font-size: 0.9em; margin-bottom: 1rem; }
.muted { color: var(--color-text-secondary); font-style: italic; }
.row { margin-bottom: 1rem; display: flex; flex-direction: column; gap: 0.35rem; }
.row label { font-size: 0.85em; color: var(--color-text-secondary); }
input, textarea { font-size: 16px; padding: 0.5rem; border: 1px solid var(--color-border); border-radius: 4px; font-family: inherit; }
.stars { display: flex; align-items: center; gap: 0.25rem; }
.star {
  background: transparent; border: none; cursor: pointer;
  font-size: 1.6rem; color: #ccc; padding: 0;
}
.star.active { color: #f5b301; }
.clear {
  margin-left: auto; background: transparent; border: 1px solid var(--color-border);
  font-size: 0.75em; padding: 0.25rem 0.5rem; border-radius: 4px;
  color: var(--color-text-secondary); cursor: pointer;
}
.actions { display: flex; justify-content: flex-end; }
.actions button { padding: 0.5rem 1.2rem; border-radius: 4px; cursor: pointer; }
.primary { background: var(--color-button-primary); color: white; border: none; }

.endorsements { margin: 1rem 0 0; border-top: 1px solid var(--color-border); padding-top: 1rem; }
.endorsements h4 { margin: 0 0 0.5rem; font-size: 0.95em; color: var(--color-text-secondary); }
.endorsements ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.9em; }
.endorsement-rating { color: #d49a00; font-weight: 600; margin-right: 0.4rem; }
.endorsement-from { color: var(--color-text); }
.endorsement-notes { color: var(--color-text-secondary); }
.suspicion {
  margin-top: 1rem; padding: 0.6rem; border-radius: 4px;
  background: rgba(220, 53, 69, 0.12); color: #c0392b; font-size: 0.85em;
}
</style>
