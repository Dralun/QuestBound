<script setup lang="ts">
import UModal from '@nuxt/ui/components/Modal.vue'
import UInput from '@nuxt/ui/components/Input.vue'
import UButton from '@nuxt/ui/components/Button.vue'
import { ref, watch } from 'vue'
import { useGameStore } from '../stores/game'
import { gameIdentifier } from '../utils/validation'

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ trigger?: HTMLElement }>()
function restoreFocus(event: Event) {
  event.preventDefault()
  props.trigger?.focus()
}
const game = useGameStore()
const enteredId = ref('')
const inputError = ref('')

watch(open, (visible) => {
  if (visible) {
    enteredId.value = game.gameId
    inputError.value = ''
  }
})
watch(enteredId, () => {
  inputError.value = ''
})

async function submit() {
  if (game.pending) return
  let id: string
  try {
    id = gameIdentifier(enteredId.value)
  } catch (cause) {
    inputError.value = (cause as Error).message
    return
  }
  if (await game.resume(id)) open.value = false
  else inputError.value = game.error
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Continue adventure"
    :description="
      game.active
        ? 'Enter a game ID. Connecting to another adventure replaces this session\'s journal and satchel.'
        : 'Enter the game ID from an adventure you started earlier.'
    "
    :dismissible="!game.pending"
    :close="!game.pending"
    :content="{ onCloseAutoFocus: restoreFocus }"
  >
    <template #body>
      <form id="continue-adventure-form" class="continue-form" @submit.prevent="submit">
        <label for="continue-game-id">Game ID</label>
        <UInput
          id="continue-game-id"
          v-model="enteredId"
          name="gameId"
          class="continue-input"
          placeholder="Enter your game ID"
          autocomplete="off"
          autocapitalize="none"
          :spellcheck="false"
          :maxlength="8"
          :disabled="Boolean(game.pending)"
          :aria-invalid="Boolean(inputError)"
          :aria-describedby="inputError ? 'continue-help continue-error' : 'continue-help'"
        />
        <p id="continue-help">
          Stats appear when the realm reports them. Your satchel records purchases made in this
          session.
        </p>
        <p v-if="inputError" id="continue-error" class="continue-error" role="alert">
          {{ inputError }}
        </p>
      </form>
    </template>
    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        :disabled="Boolean(game.pending)"
        @click="open = false"
        >Cancel</UButton
      >
      <UButton
        type="submit"
        form="continue-adventure-form"
        icon="i-game-icons-return-arrow"
        :loading="game.pending === 'continue'"
        :disabled="Boolean(game.pending)"
        >Continue adventure</UButton
      >
    </template>
  </UModal>
</template>
