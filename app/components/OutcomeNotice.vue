<script setup lang="ts">
import UIcon from '@nuxt/ui/components/Icon.vue'
import type { Outcome } from '../types/game'

defineProps<{ outcome: Outcome }>()
</script>

<template>
  <div class="outcome-notice" :class="{ 'outcome-failed': !outcome.success }" role="status">
    <UIcon
      :name="outcome.success ? 'game-icons:check-mark' : 'game-icons:skull-crossed-bones'"
      class="outcome-icon"
      aria-hidden="true"
    />
    <div class="outcome-copy">
      <strong>{{ outcome.title }}</strong>
      <p>{{ outcome.message }}</p>
      <span class="sr-only">Success: {{ outcome.success }}</span>
    </div>
    <span v-if="outcome.kind === 'quest'" class="outcome-change">
      <template v-if="outcome.success">
        <UIcon name="game-icons:two-coins" aria-hidden="true" />
        <template v-if="outcome.goldGained !== null"
          >+{{ outcome.goldGained }} <span>gold gained</span></template
        >
        <span v-else>Gold updated</span>
      </template>
      <template v-else>
        <UIcon name="game-icons:hearts" aria-hidden="true" />
        <template v-if="outcome.livesLost !== null"
          >{{ outcome.livesLost > 0 ? '-' : '' }}{{ outcome.livesLost }}
          <span>{{ outcome.livesLost === 1 ? 'life' : 'lives' }} lost</span></template
        >
        <span v-else>Lives updated</span>
      </template>
    </span>
  </div>
</template>
