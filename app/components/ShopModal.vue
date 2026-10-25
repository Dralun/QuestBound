<script setup lang="ts">
import UModal from '@nuxt/ui/components/Modal.vue'
import UIcon from '@nuxt/ui/components/Icon.vue'
import LevelNotice from './LevelNotice.vue'
import OutcomeNotice from './OutcomeNotice.vue'
import UButton from '@nuxt/ui/components/Button.vue'
import { computed } from 'vue'
import { useGameStore } from '../stores/game'
import { shopIcons } from '../utils/icons'

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ trigger?: HTMLElement }>()
function restoreFocus(event: Event) {
  event.preventDefault()
  props.trigger?.focus()
}
const game = useGameStore()
const icons = computed(() => shopIcons(game.shop.map((item) => item.id)))
const lastPurchase = computed(() =>
  game.activeOutcome?.kind === 'purchase' ? game.activeOutcome : undefined,
)
</script>

<template>
  <UModal
    v-model:open="open"
    title="The wandering merchant"
    description="A little gold. A little edge. A longer legend."
    :ui="{ content: 'shop-modal sm:max-w-2xl' }"
    :content="{ onCloseAutoFocus: restoreFocus }"
  >
    <template #body>
      <div class="shop-balance">
        <span><UIcon name="game-icons:two-coins" aria-hidden="true" /> Your gold</span
        ><strong>{{ game.isStatKnown('gold') ? game.stats.gold : '—' }}</strong>
      </div>
      <LevelNotice v-if="game.levelUp !== undefined" :level="game.levelUp" />
      <OutcomeNotice v-if="lastPurchase" :outcome="lastPurchase" />
      <p v-if="game.error" class="shop-error" role="alert">{{ game.error }}</p>
      <div v-if="game.pending === 'shop'" class="shop-loading" role="status">
        <UIcon name="game-icons:rolling-energy" class="animate-spin" aria-hidden="true" /> Unpacking
        the merchant’s wares…
      </div>
      <div v-else-if="!game.shopLoaded" class="shop-loading">
        <p>The merchant could not be reached.</p>
        <UButton
          variant="outline"
          :disabled="Boolean(game.pending) || game.autoplayRunning"
          @click="game.openShop()"
          >Try again</UButton
        >
      </div>
      <ul v-else class="shop-items">
        <li v-for="item in game.shop" :key="item.id">
          <div class="item-icon"><UIcon :name="icons[item.id]!" aria-hidden="true" /></div>
          <div class="shop-item-copy">
            <h3>{{ item.name }}</h3>
            <span
              ><UIcon name="game-icons:two-coins" aria-hidden="true" /> {{ item.cost }} gold</span
            >
          </div>
          <UButton
            color="neutral"
            variant="outline"
            :aria-label="`Buy ${item.name}`"
            :disabled="!game.canAct || !game.isStatKnown('gold') || game.stats.gold < item.cost"
            :loading="game.pending === `buy:${item.id}`"
            @click="game.buy(item.id)"
            >{{
              !game.isStatKnown('gold')
                ? 'Gold unknown'
                : game.stats.gold < item.cost
                  ? 'Need gold'
                  : 'Purchase'
            }}</UButton
          >
        </li>
      </ul>
      <p class="shop-note">
        Successful purchases are recorded in your satchel. Every purchase attempt costs a turn.
      </p>
    </template>
  </UModal>
</template>
