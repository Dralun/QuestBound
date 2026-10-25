<script setup lang="ts">
import UButton from '@nuxt/ui/components/Button.vue'
import { useGameStore } from '../stores/game'

const game = useGameStore()
</script>

<template>
  <section class="autoplay-controls" aria-label="Autoplay">
    <UButton
      v-if="game.autoplayRunning"
      color="warning"
      variant="outline"
      size="sm"
      icon="i-game-icons-cancel"
      @click="game.stopAutoplay()"
      >Stop autoplay</UButton
    >
    <UButton
      v-else
      color="neutral"
      variant="outline"
      size="sm"
      icon="i-game-icons-compass"
      :disabled="Boolean(game.autoplayUnavailable)"
      @click="game.startAutoplay()"
      >Start autoplay</UButton
    >
    <p class="autoplay-status" role="status" aria-live="polite">
      {{
        !game.autoplayRunning && game.autoplayUnavailable
          ? game.autoplayUnavailable
          : game.autoplayStatus
      }}
    </p>
  </section>
</template>
