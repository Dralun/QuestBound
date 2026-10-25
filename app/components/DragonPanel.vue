<script setup lang="ts">
import UIcon from '@nuxt/ui/components/Icon.vue'
import UButton from '@nuxt/ui/components/Button.vue'
import ReputationStats from './ReputationStats.vue'
import { computed } from 'vue'
import { useGameStore } from '../stores/game'
import { shopIcons } from '../utils/icons'

defineEmits<{ shop: [event: MouseEvent] }>()
const game = useGameStore()
const icons = computed(() => shopIcons(game.purchases.map((item) => item.id)))
const purchaseCount = computed(() =>
  game.purchases.reduce((total, item) => total + item.quantity, 0),
)
</script>

<template>
  <aside class="dragon-panel">
    <div class="dragon-profile">
      <div class="dragon-seal" aria-hidden="true">
        <span class="seal-orbit" /><UIcon name="game-icons:dragon-head" /><span class="seal-star"
          >✦</span
        >
      </div>
      <h2>{{ game.gameOver ? 'A resting legend' : 'A legend in the making' }}</h2>
      <p>
        {{
          game.active
            ? 'One quest at a time. One tale to remember.'
            : 'Even the greatest dragons begin somewhere.'
        }}
      </p>
      <span class="level-badge"
        ><UIcon name="game-icons:laurels" aria-hidden="true" />
        {{
          game.active
            ? game.isStatKnown('level')
              ? `Level ${game.stats.level}`
              : 'Level unknown'
            : 'Awaiting adventure'
        }}</span
      >
    </div>
    <ReputationStats />
    <div class="inventory-section">
      <div class="section-heading">
        <h3>
          <UIcon name="game-icons:knapsack" aria-hidden="true" />
          {{ game.resumed ? 'Purchases this session' : 'Your purchases' }}
        </h3>
        <span class="count">{{ purchaseCount }}</span>
      </div>
      <div v-if="!game.purchases.length" class="inventory-empty">
        <p>
          {{ game.resumed ? 'No purchases recorded this session.' : 'Traveling light, for now.' }}
        </p>
        <span>Purchased items will appear here.</span>
      </div>
      <ul v-else class="inventory-list">
        <li v-for="item in game.purchases" :key="item.id">
          <UIcon :name="icons[item.id]!" aria-hidden="true" /><span>{{ item.name }}</span
          ><b>×{{ item.quantity }}</b>
        </li>
      </ul>
      <UButton
        block
        color="neutral"
        variant="outline"
        icon="i-game-icons-village"
        :disabled="!game.canAct"
        @click="$emit('shop', $event)"
        >Visit the merchant
        <UIcon name="game-icons:plain-arrow" class="merchant-arrow" aria-hidden="true"
      /></UButton>
    </div>
    <div class="dragon-tip">
      <UIcon name="game-icons:open-book" aria-hidden="true" />
      <p>
        <strong>A word to the wise</strong>Gold buys more than trinkets. A healing potion might just
        buy you another chapter.
      </p>
    </div>
  </aside>
</template>
