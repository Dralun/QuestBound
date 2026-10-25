<script setup lang="ts">
import UIcon from '@nuxt/ui/components/Icon.vue'
import { useGameStore } from '../stores/game'

const game = useGameStore()
const metrics = [
  { key: 'lives', label: 'Lives', icon: 'game-icons:hearts', class: 'life-stat' },
  { key: 'gold', label: 'Gold', icon: 'game-icons:two-coins', class: 'gold-stat' },
  { key: 'score', label: 'Score', icon: 'game-icons:laurels', class: '' },
  { key: 'turn', label: 'Turn', icon: 'game-icons:hourglass', class: '' },
] as const
</script>

<template>
  <dl class="stats-strip" aria-label="Player statistics" aria-live="polite" aria-atomic="true">
    <div v-for="metric in metrics" :key="metric.key" class="stat" :class="metric.class">
      <UIcon :name="metric.icon" class="stat-icon" aria-hidden="true" />
      <div>
        <dt>{{ metric.label }}</dt>
        <dd :data-testid="`stat-${metric.key}`">
          {{
            game.active && game.isStatKnown(metric.key)
              ? game.stats[metric.key].toLocaleString()
              : '—'
          }}
        </dd>
      </div>
    </div>
  </dl>
</template>
