import type { Purchase, Quest, ShopItem } from '../types/game'
import { hasPeopleKeywords, questDifficulty } from './questFilters'

export type AutoplayAction =
  | { kind: 'shop'; description: string }
  | { kind: 'refresh'; description: string }
  | { kind: 'quest'; id: string; description: string }
  | { kind: 'buy'; id: string; description: string }
  | { kind: 'stop'; description: string }

export interface AutoplayState {
  active: boolean
  gameOver: boolean
  uncertain: boolean
  pending: string
  error: string
  boardLoaded: boolean
  lives: number | null
  gold: number | null
  messages: Quest[]
  shopLoaded: boolean
  shop: ShopItem[]
  purchases: Purchase[]
  declinedItemId?: string
}

function quantity(purchases: Purchase[], id: string): number {
  let total = 0
  for (const item of purchases) {
    if (item.id === id) total += item.quantity
  }
  return total
}

function nextUpgrade(shop: ShopItem[], purchases: Purchase[]): ShopItem | undefined {
  const starter = shop.find((item) => item.cost === 100 && quantity(purchases, item.id) === 0)
  if (starter) return starter
  let next: ShopItem | undefined
  for (const item of shop) {
    if (item.cost !== 300) continue
    if (!next || quantity(purchases, item.id) < quantity(purchases, next.id)) next = item
  }
  return next
}

function compareQuests(first: Quest, second: Quest): number {
  const difficulty = questDifficulty(first.probability) - questDifficulty(second.probability)
  if (difficulty !== 0) return difficulty

  const firstHelpsPeople = hasPeopleKeywords(first.message)
  const secondHelpsPeople = hasPeopleKeywords(second.message)
  if (firstHelpsPeople !== secondHelpsPeople) return firstHelpsPeople ? -1 : 1

  const reward = second.reward - first.reward
  if (reward !== 0) return reward
  return first.expiresIn - second.expiresIn
}

export function planAutoplay(state: AutoplayState): AutoplayAction {
  if (!state.active) return { kind: 'stop', description: 'Start or continue an adventure first.' }
  if (state.gameOver)
    return { kind: 'stop', description: 'Adventure complete. Start a new game to play again.' }
  if (state.uncertain)
    return { kind: 'stop', description: 'An action is unconfirmed. Autoplay is paused.' }
  if (state.pending) return { kind: 'stop', description: 'Wait for the current action to finish.' }
  if (state.error)
    return {
      kind: 'stop',
      description: 'Autoplay stopped after an error. Start it again to retry.',
    }
  if (!state.boardLoaded)
    return { kind: 'refresh', description: 'Refresh the message board to find the next quest.' }
  const upgrade = nextUpgrade(state.shop, state.purchases)
  const needsHealing = state.lives === 1
  const healthy = state.lives !== null && state.lives > 1
  const canShop =
    state.gold !== null &&
    ((needsHealing && state.gold > 0 && state.declinedItemId !== 'hpot') ||
      (healthy &&
        state.gold >= (upgrade?.cost ?? 100) &&
        (!upgrade || state.declinedItemId !== upgrade.id)))
  if (!state.shopLoaded && canShop)
    return { kind: 'shop', description: 'Check the merchant for an affordable purchase.' }
  const item = needsHealing
    ? state.shop.find(
        (item) => item.id === 'hpot' || item.name.trim().toLowerCase() === 'healing potion',
      )
    : upgrade
  if (
    (needsHealing || healthy) &&
    item &&
    item.id !== state.declinedItemId &&
    state.gold !== null &&
    state.gold >= item.cost
  ) {
    return {
      kind: 'buy',
      id: item.id,
      description: `Buy ${item.name}${needsHealing ? ' to restore health' : ''} (${item.cost} gold).`,
    }
  }
  const quest = state.messages.filter((message) => message.expiresIn > 0).toSorted(compareQuests)[0]
  if (!quest)
    return {
      kind: 'refresh',
      description: 'The board is empty. Check again for new quests.',
    }
  return {
    kind: 'quest',
    id: quest.adId,
    description: `Solve “${quest.message}” — ${quest.probability}, ${quest.reward} gold.`,
  }
}
