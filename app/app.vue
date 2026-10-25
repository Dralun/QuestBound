<script setup lang="ts">
import UApp from '@nuxt/ui/components/App.vue'
import UIcon from '@nuxt/ui/components/Icon.vue'
import UButton from '@nuxt/ui/components/Button.vue'
import PlayerStats from './components/PlayerStats.vue'
import AutoplayControls from './components/AutoplayControls.vue'
import LevelNotice from './components/LevelNotice.vue'
import OutcomeNotice from './components/OutcomeNotice.vue'
import QuestBoard from './components/QuestBoard.vue'
import DragonPanel from './components/DragonPanel.vue'
import ShopModal from './components/ShopModal.vue'
import ContinueAdventureModal from './components/ContinueAdventureModal.vue'
import UModal from '@nuxt/ui/components/Modal.vue'
import { ref } from 'vue'
import { useGameStore } from './stores/game'

const game = useGameStore()
const shopOpen = ref(false)
const shopTrigger = ref<HTMLElement>()
const journalOpen = ref(false)
const restartOpen = ref(false)
const continueOpen = ref(false)
const continueTrigger = ref<HTMLElement>()

function openContinue(event: MouseEvent) {
  continueTrigger.value = event.currentTarget as HTMLElement
  continueOpen.value = true
}

async function visitShop(event: MouseEvent) {
  shopTrigger.value = event.currentTarget as HTMLElement
  shopOpen.value = true
  await game.openShop()
}

function begin() {
  if (game.active && !game.gameOver) {
    restartOpen.value = true
  } else game.start()
}

async function confirmRestart() {
  restartOpen.value = false
  await game.start()
}
</script>

<template>
  <UApp>
    <a class="skip-link" href="#adventure">Skip to adventure</a>
    <div class="app-shell">
      <header class="site-header">
        <a href="#" class="brand" aria-label="Questbound home"
          ><UIcon name="game-icons:wyvern" aria-hidden="true" /><span>QUESTBOUND</span></a
        >
        <nav aria-label="Main navigation">
          <a href="#adventure" class="nav-active"
            ><UIcon name="game-icons:compass" aria-hidden="true" /> Adventure</a
          ><button :disabled="!game.active" @click="journalOpen = true">
            <UIcon name="game-icons:quill-ink" aria-hidden="true" /> Journal
            <span v-if="game.history.length" class="journal-dot" />
          </button>
        </nav>
      </header>
      <main id="adventure" tabindex="-1">
        <section class="adventure-heading">
          <div>
            <p class="eyebrow"><span class="gold-rule" /> THE ADVENTURE IS YOURS</p>
            <h1>Home is behind,<br /><em>the world ahead</em></h1>
          </div>
          <div class="adventure-actions">
            <UButton
              class="start-button"
              size="lg"
              icon="i-game-icons-dragon-breath"
              :loading="game.pending === 'start'"
              :disabled="Boolean(game.pending) || game.autoplayRunning"
              @click="begin"
              >{{ game.active ? 'New adventure' : 'Start adventure' }}</UButton
            >
            <UButton
              color="neutral"
              variant="outline"
              icon="i-game-icons-return-arrow"
              class="continue-button"
              :disabled="Boolean(game.pending) || game.autoplayRunning"
              @click="openContinue"
              >Continue adventure</UButton
            >
            <div v-if="game.active" class="current-game">
              <span>Game ID</span><code data-testid="current-game-id">{{ game.gameId }}</code>
            </div>
          </div>
        </section>
        <p v-if="game.resumed && game.unknownStats.length" class="resume-note">
          Some stats are unknown until the realm reports them. Shop purchases become available once
          your gold is known.
        </p>
        <PlayerStats />
        <AutoplayControls />
        <div v-if="game.error || game.uncertain" class="error-banner" role="alert">
          <UIcon name="game-icons:cancel" aria-hidden="true" />
          <div>
            <strong>{{
              game.uncertain ? 'The action could not be confirmed.' : 'A snag in the adventure.'
            }}</strong>
            <p v-if="game.error">{{ game.error }}</p>
            <p v-if="game.uncertain">
              The last action may have completed. Refresh quests to continue this adventure. Stats
              will be unknown until the realm reports them again.
            </p>
            <UButton
              v-if="game.uncertain"
              class="mt-3"
              color="neutral"
              variant="outline"
              :disabled="Boolean(game.pending) || game.autoplayRunning"
              :loading="game.pending === 'continue'"
              @click="game.recover()"
              >Refresh and continue</UButton
            >
          </div>
          <UButton
            v-if="!game.uncertain"
            color="neutral"
            variant="ghost"
            aria-label="Dismiss error"
            icon="i-game-icons-cancel"
            @click="game.error = ''"
          />
        </div>
        <div v-if="game.levelUp !== undefined || game.activeOutcome" class="adventure-notices">
          <LevelNotice v-if="game.levelUp !== undefined" :level="game.levelUp" />
          <OutcomeNotice v-if="game.activeOutcome" :outcome="game.activeOutcome" />
        </div>
        <div class="game-layout"><QuestBoard /><DragonPanel @shop="visitShop" /></div>
      </main>
      <footer class="site-footer">
        <span
          ><UIcon name="game-icons:wyvern" aria-hidden="true" /> All we have to decide is what to do
          with the time that is given us.</span
        >
      </footer>
    </div>
    <ShopModal v-model:open="shopOpen" :trigger="shopTrigger" />
    <ContinueAdventureModal v-model:open="continueOpen" :trigger="continueTrigger" />
    <UModal
      v-model:open="journalOpen"
      title="Your adventure journal"
      description="The last 50 moments that shaped your legend."
    >
      <template #body
        ><p v-if="!game.history.length" class="journal-empty">
          No tales to tell just yet. Complete a quest to begin your journal.
        </p>
        <ol v-else class="journal-list">
          <li v-for="outcome in game.history" :key="outcome.id">
            <span class="eyebrow">TURN {{ outcome.turn }}</span
            ><OutcomeNotice :outcome="outcome" />
          </li></ol
      ></template>
    </UModal>
    <UModal
      v-model:open="restartOpen"
      title="Begin a new chapter?"
      description="Your current adventure and satchel will be cleared. Your journal starts fresh."
    >
      <template #footer
        ><UButton color="neutral" variant="outline" @click="restartOpen = false"
          >Keep playing</UButton
        ><UButton icon="i-game-icons-dragon-breath" @click="confirmRestart"
          >Start new adventure</UButton
        ></template
      >
    </UModal>
  </UApp>
</template>
