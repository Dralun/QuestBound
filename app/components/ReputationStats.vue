<script setup lang="ts">
import UIcon from '@nuxt/ui/components/Icon.vue'
import UButton from '@nuxt/ui/components/Button.vue'
import { useGameStore } from '../stores/game'
import type { Reputation } from '../types/game'

const game = useGameStore()
const metrics = [
  { key: 'people', label: 'People', icon: 'game-icons:village' },
  { key: 'state', label: 'State', icon: 'game-icons:trophy-cup' },
  { key: 'underworld', label: 'Underworld', icon: 'game-icons:skull-crossed-bones' },
] as const

function displayValue(key: keyof Reputation): string | number {
  const value = game.reputation?.[key]
  if (value == null) return '—'
  return key === 'people' ? Number(value.toFixed(2)) : value
}
</script>

<template>
  <section
    class="reputation-panel"
    aria-labelledby="reputation-title"
    :aria-busy="game.reputationLoading"
  >
    <div class="reputation-heading">
      <h2 id="reputation-title">Reputation</h2>
      <p :role="game.reputationLoading ? 'status' : undefined">
        {{
          game.reputationLoading
            ? 'Updating reputation…'
            : game.reputation
              ? 'Last investigated values'
              : 'Not investigated yet'
        }}
      </p>
    </div>
    <dl class="reputation-counters" aria-live="polite" aria-atomic="true">
      <div v-for="metric in metrics" :key="metric.key">
        <UIcon :name="metric.icon" aria-hidden="true" />
        <dt>{{ metric.label }}</dt>
        <dd :data-testid="`reputation-${metric.key}`">
          {{ displayValue(metric.key) }}
        </dd>
      </div>
    </dl>
    <UButton
      v-if="game.active"
      block
      color="neutral"
      variant="outline"
      size="sm"
      :loading="game.reputationLoading"
      :disabled="!game.canAct"
      @click="game.refreshReputation()"
      >Investigate reputation</UButton
    >
    <div
      v-if="!game.reputationLoading && game.reputationError"
      class="reputation-error"
      role="alert"
    >
      <p>{{ game.reputationError }}</p>
    </div>
  </section>
</template>
