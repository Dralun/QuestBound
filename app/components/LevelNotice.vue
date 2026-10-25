<script setup lang="ts">
import UAlert from '@nuxt/ui/components/Alert.vue'
defineProps<{ level: number }>()
</script>

<template>
  <UAlert
    class="level-notice"
    role="status"
    color="primary"
    variant="soft"
    icon="i-game-icons-laurels"
    title="Congratulations!"
    :description="`Your dragon reached level ${level}.`"
  />
</template>
