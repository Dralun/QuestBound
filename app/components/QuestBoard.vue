<script setup lang="ts">
import UIcon from '@nuxt/ui/components/Icon.vue'
import UButton from '@nuxt/ui/components/Button.vue'
import UInput from '@nuxt/ui/components/Input.vue'
import USkeleton from '@nuxt/ui/components/Skeleton.vue'
import UModal from '@nuxt/ui/components/Modal.vue'
import { computed, ref, watch } from 'vue'
import { useGameStore } from '../stores/game'
import type { Quest } from '../types/game'
import { hasPeopleKeywords, isSafeQuest, isRiskyQuest } from '../utils/questFilters'

const game = useGameStore()
const enabledFilters = ref({ safer: false, people: false, state: false })
const filters = [
  { key: 'safer', label: 'Safer bets' },
  { key: 'people', label: 'Helping the people' },
  { key: 'state', label: 'Helping the state' },
] as const
const sort = ref('board')
const search = ref('')
const stateKeywords = ['infiltrate', 'investigate']
const warningOpen = ref(false)
const selectedQuest = ref<Quest>()
const questTrigger = ref<HTMLButtonElement>()
const board = ref<HTMLElement>()

watch([() => game.gameId, () => game.stats.turn], () => {
  warningOpen.value = false
  selectedQuest.value = undefined
})

function attemptQuest(quest: Quest, event: MouseEvent) {
  if (!game.canAct || !game.boardLoaded) return
  if ((!game.isStatKnown('lives') || game.stats.lives === 1) && isRiskyQuest(quest.probability)) {
    questTrigger.value = event.currentTarget as HTMLButtonElement
    selectedQuest.value = quest
    warningOpen.value = true
  } else game.solve(quest.adId)
}

function confirmQuest() {
  const quest = selectedQuest.value
  if (!warningOpen.value || !quest) return
  warningOpen.value = false
  selectedQuest.value = undefined
  game.solve(quest.adId)
}

function restoreQuestFocus(event: Event) {
  event.preventDefault()
  const trigger = questTrigger.value
  if (trigger?.isConnected && !trigger.disabled) trigger.focus({ preventScroll: true })
  else board.value?.focus({ preventScroll: true })
}
const displayed = computed(() => {
  const selected = game.messages.filter((quest) => {
    const description = quest.message.toLowerCase()
    return (
      (!enabledFilters.value.safer || isSafeQuest(quest.probability)) &&
      (!enabledFilters.value.people || hasPeopleKeywords(quest.message)) &&
      (!enabledFilters.value.state || stateKeywords.some((word) => description.includes(word))) &&
      description.includes(search.value.toLowerCase())
    )
  })
  if (sort.value === 'reward') selected.sort((a, b) => b.reward - a.reward)
  if (sort.value === 'expiry') selected.sort((a, b) => a.expiresIn - b.expiresIn)
  return selected
})
</script>

<template>
  <section
    ref="board"
    class="board"
    tabindex="-1"
    aria-labelledby="board-title"
    :aria-busy="Boolean(game.pending)"
  >
    <div class="section-heading">
      <div class="section-title">
        <UIcon name="game-icons:scroll-unfurled" aria-hidden="true" />
        <h2 id="board-title">The message board</h2>
      </div>
      <UButton
        v-if="game.active"
        icon="i-game-icons-return-arrow"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="Boolean(game.pending) || game.gameOver || game.autoplayRunning"
        :loading="game.messagesLoading"
        @click="game.refresh()"
        >Refresh<span class="sr-only"> board</span></UButton
      >
    </div>
    <p class="section-description">A realm full of requests. A dragon to answer them.</p>

    <template v-if="game.active">
      <div class="board-toolbar">
        <div class="board-filters" role="group" aria-label="Filter quests">
          <UButton
            v-for="filter in filters"
            :key="filter.key"
            :color="enabledFilters[filter.key] ? 'primary' : 'neutral'"
            :variant="enabledFilters[filter.key] ? 'soft' : 'outline'"
            size="sm"
            :aria-pressed="enabledFilters[filter.key]"
            @click="enabledFilters[filter.key] = !enabledFilters[filter.key]"
            >{{ filter.label }}</UButton
          >
        </div>
        <label class="sort-label"
          >Sort by
          <select v-model="sort" aria-label="Sort quests">
            <option value="board">Board order</option>
            <option value="reward">Highest reward</option>
            <option value="expiry">Expiring soon</option>
          </select>
        </label>
      </div>
      <UInput
        v-if="game.messages.length > 6 || search"
        v-model="search"
        class="quest-search"
        placeholder="Search the message board…"
        aria-label="Search quests"
        icon="i-game-icons-quill-ink"
      />
    </template>

    <div v-if="!game.active" class="board-empty welcome-board">
      <UIcon name="game-icons:quill-ink" aria-hidden="true" />
      <h3>Your story is yet to be written.</h3>
      <p>
        Start an adventure to discover the realm's requests. Choose your quests, earn your gold, and
        make a name for yourself.
      </p>
    </div>
    <div v-else-if="game.gameOver" class="board-empty">
      <UIcon name="game-icons:campfire" aria-hidden="true" />
      <h3>So comes snow after fire, and even dragons have their endings.</h3>
      <p>
        {{
          game.isStatKnown('score')
            ? `Your journey ends with ${game.stats.score} points.`
            : 'Your journey ends here.'
        }}
        But in the end it's only a passing thing, this shadow; even darkness must pass.
      </p>
    </div>
    <div
      v-else-if="!game.boardLoaded && !game.messages.length && game.pending"
      class="quest-skeletons"
      role="status"
    >
      <span class="sr-only">Fetching requests from the realm…</span>
      <USkeleton v-for="n in 3" :key="n" class="quest-skeleton" />
    </div>
    <div v-else-if="!game.boardLoaded && !game.messages.length" class="board-empty">
      <UIcon name="game-icons:scroll-unfurled" aria-hidden="true" />
      <h3>The board is out of reach.</h3>
      <p>Refresh the board to fetch the latest requests.</p>
      <UButton
        color="neutral"
        variant="outline"
        :disabled="game.autoplayRunning"
        @click="game.refresh()"
        >Try again</UButton
      >
    </div>
    <div v-else-if="displayed.length === 0" class="board-empty">
      <UIcon name="game-icons:scroll-unfurled" aria-hidden="true" />
      <p>
        {{
          game.messages.length
            ? 'Try another filter or search.'
            : 'Check the board again for new quests.'
        }}
      </p>
    </div>
    <div v-else class="quest-list">
      <article
        v-for="(quest, index) in displayed"
        :key="quest.adId"
        class="quest-row"
        :class="{
          'quest-pending': game.pending === `solve:${quest.adId}`,
          'quest-autoplay':
            game.autoplayRunning &&
            game.autoplayNextAction?.kind === 'quest' &&
            game.autoplayNextAction.id === quest.adId,
        }"
      >
        <span class="quest-number" aria-hidden="true">{{
          String(index + 1).padStart(2, '0')
        }}</span>
        <div class="quest-content">
          <p>{{ quest.message }}</p>
          <div class="quest-meta">
            <span
              class="probability"
              :class="isSafeQuest(quest.probability) ? 'probability-safe' : 'probability-risk'"
            >
              <span class="probability-dot" aria-hidden="true" />
              <span class="sr-only">Probability:</span>{{ quest.probability }}
            </span>
            <span class="expiry" :class="{ urgent: quest.expiresIn <= 2 }"
              ><UIcon name="game-icons:calendar" aria-hidden="true" /><span class="sr-only"
                >Expires in</span
              >
              {{ quest.expiresIn }} {{ quest.expiresIn === 1 ? 'turn' : 'turns' }}</span
            >
          </div>
        </div>
        <span class="quest-reward"
          ><UIcon name="game-icons:two-coins" aria-hidden="true" />{{ quest.reward
          }}<span class="sr-only"> gold reward</span></span
        >
        <UButton
          icon="i-game-icons-crossed-swords"
          color="neutral"
          variant="outline"
          class="solve-button"
          :aria-label="`Solve quest ${index + 1}`"
          :disabled="!game.canAct || !game.boardLoaded"
          :loading="game.pending === `solve:${quest.adId}`"
          @click="attemptQuest(quest, $event)"
          >Solve</UButton
        >
      </article>
    </div>
    <p
      v-if="!game.boardLoaded && game.messages.length && !game.gameOver"
      class="board-stale"
      role="status"
    >
      Showing the last loaded requests. Refresh before choosing a quest.
    </p>
    <div class="board-footnote">
      <UIcon name="game-icons:hourglass" aria-hidden="true" /><span
        >Every quest attempt, shop purchase and reputation investigation advances a turn. Choose
        wisely.</span
      >
    </div>
  </section>
  <UModal
    v-model:open="warningOpen"
    title="Attempt a risky quest?"
    :description="
      game.isStatKnown('lives')
        ? 'You are low on health. Are you sure you want to do this?'
        : 'Your health is unknown. Are you sure you want to attempt this quest?'
    "
    :content="{ onCloseAutoFocus: restoreQuestFocus }"
  >
    <template #body>
      <div v-if="selectedQuest" class="quest-warning">
        <p>
          <UIcon name="game-icons:hearts" aria-hidden="true" />
          {{
            game.isStatKnown('lives')
              ? 'You have 1 life left.'
              : 'The realm has not reported your remaining lives yet.'
          }}
          A failed attempt could end your adventure.
        </p>
        <blockquote>{{ selectedQuest.message }}</blockquote>
        <span
          >Probability: <strong>{{ selectedQuest.probability }}</strong></span
        >
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" @click="warningOpen = false">Cancel</UButton>
      <UButton
        color="warning"
        icon="i-game-icons-crossed-swords"
        :disabled="!game.canAct || !game.boardLoaded"
        @click="confirmQuest"
        >Attempt quest</UButton
      >
    </template>
  </UModal>
</template>
