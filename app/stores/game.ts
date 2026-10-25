import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, createLiveTransport } from '../services/api'
import { RequestCancelledError } from '../services/requestQueue'
import { useTimedNotice } from '../composables/useTimedNotice'
import { useAutoplay } from '../composables/useAutoplay'
import { planAutoplay } from '../utils/autoplay'
import type {
  Outcome,
  Purchase,
  Quest,
  Reputation,
  ShopItem,
  Stats,
  StatKey,
  Transport,
} from '../types/game'
import { statKeys } from '../types/game'
import {
  flag,
  gameIdentifier,
  identifier,
  items,
  parseReputation,
  quests,
  record,
  statsPatch,
  text,
} from '../utils/validation'

const emptyStats = (): Stats => ({ lives: 0, gold: 0, score: 0, turn: 0, level: 0 })

export const useGameStore = defineStore('game', () => {
  const gameId = ref('')
  const stats = ref(emptyStats())
  const unknownStats = ref<StatKey[]>([])
  const resumed = ref(false)
  const reputation = ref<Reputation | null>(null)
  const reputationLoading = ref(false)
  const reputationError = ref('')
  const messages = ref<Quest[]>([])
  const shop = ref<ShopItem[]>([])
  const purchases = ref<Purchase[]>([])
  const history = ref<Outcome[]>([])
  const pending = ref('')
  const error = ref('')
  const boardLoaded = ref(false)
  const messagesLoading = ref(false)
  const shopLoaded = ref(false)
  const declinedItemId = ref<string>()
  const uncertain = ref(false)
  const active = computed(() => Boolean(gameId.value))
  const gameOver = computed(() => active.value && isStatKnown('lives') && stats.value.lives === 0)
  const canMutate = computed(
    () => active.value && !gameOver.value && !pending.value && !uncertain.value,
  )
  let autoplaySignal: AbortSignal | undefined
  const autoplay = useAutoplay(autoplayPlan, async (action, signal) => {
    autoplaySignal = signal
    try {
      if (action.kind === 'shop') await fetchShop()
      else if (action.kind === 'refresh') await run('messages', loadMessages)
      else if (action.kind === 'quest') {
        await solveQuest(action.id)
        declinedItemId.value = undefined
      } else {
        await buyItem(action.id)
        if (lastOutcome.value?.kind === 'purchase' && !lastOutcome.value.success)
          declinedItemId.value = action.id
      }
    } finally {
      autoplaySignal = undefined
    }
  })
  const canAct = computed(() => canMutate.value && !autoplay.running.value)
  const autoplayUnavailable = computed(() => {
    const action = autoplayPlan('')
    return action.kind === 'stop' ? action.description : ''
  })
  const lastOutcome = computed(() => history.value[0])
  const {
    notice: activeOutcome,
    show: showOutcome,
    clear: clearOutcome,
  } = useTimedNotice<Outcome>()
  const { notice: levelUp, show: showLevelUp, clear: clearLevelUp } = useTimedNotice<number>()
  let transport: Transport = createLiveTransport('')
  let sequence = 0

  function autoplayPlan(currentError = error.value) {
    return planAutoplay({
      active: active.value,
      gameOver: gameOver.value,
      uncertain: uncertain.value,
      pending: pending.value,
      error: currentError,
      boardLoaded: boardLoaded.value,
      lives: isStatKnown('lives') ? stats.value.lives : null,
      gold: isStatKnown('gold') ? stats.value.gold : null,
      messages: messages.value,
      shopLoaded: shopLoaded.value,
      shop: shop.value,
      purchases: purchases.value,
      declinedItemId: declinedItemId.value,
    })
  }

  function startAutoplay() {
    if (autoplay.running.value || autoplayUnavailable.value) return
    error.value = ''
    autoplay.start()
  }

  function reportError(message: string) {
    error.value = message
    if (autoplay.running.value)
      autoplay.stop(
        'Autoplay stopped after an error. Refresh the board or start autoplay to try again.',
      )
  }

  function setTransport(next: Transport) {
    if (pending.value) return
    transport = next
  }

  function reset() {
    autoplay.stop('Choose Start autoplay to let your dragon play.')
    clearOutcome()
    clearLevelUp()
    gameId.value = ''
    stats.value = emptyStats()
    unknownStats.value = []
    resumed.value = false
    reputation.value = null
    reputationLoading.value = false
    reputationError.value = ''
    messages.value = []
    shop.value = []
    purchases.value = []
    history.value = []
    error.value = ''
    uncertain.value = false
    boardLoaded.value = false
    messagesLoading.value = false
    shopLoaded.value = false
    declinedItemId.value = undefined
  }

  function isStatKnown(key: StatKey) {
    return !unknownStats.value.includes(key)
  }

  function applyStats(patch: Partial<Stats>) {
    const previousLevel = stats.value.level
    const levelKnown = isStatKnown('level')
    Object.assign(stats.value, patch)
    unknownStats.value = unknownStats.value.filter((key) => !Object.hasOwn(patch, key))
    if (gameOver.value) {
      messages.value = []
      reputationError.value = ''
    }
    if (levelKnown && patch.level !== undefined && patch.level > previousLevel)
      showLevelUp(patch.level)
  }

  async function request(path: string, method: 'GET' | 'POST' = 'GET') {
    const payload = autoplaySignal
      ? await transport(path, method, autoplaySignal)
      : await transport(path, method)
    applyStats(statsPatch(payload))
    return payload
  }

  async function run(action: string, work: () => Promise<void>, mutation = false) {
    if (pending.value) return
    pending.value = action
    error.value = ''
    try {
      await work()
    } catch (cause) {
      if (cause instanceof RequestCancelledError) return
      reportError(
        cause instanceof Error ? cause.message : 'Something went wrong. Please try again.',
      )
      if (mutation) {
        uncertain.value = !(cause instanceof ApiError && cause.rejected)
        boardLoaded.value = false
      }
    } finally {
      pending.value = ''
    }
  }

  async function loadMessages() {
    if (gameOver.value) return
    messagesLoading.value = true
    try {
      const payload = await request(`/${identifier(gameId.value)}/messages`)
      messages.value = gameOver.value ? [] : quests(payload)
      boardLoaded.value = true
    } catch (cause) {
      boardLoaded.value = false
      throw cause
    } finally {
      messagesLoading.value = false
    }
  }

  async function refreshAfterAction() {
    try {
      await loadMessages()
    } catch (cause) {
      if (cause instanceof RequestCancelledError) return
      reportError(
        'Your action is complete and your stats are updated. The message board could not refresh. Refresh it before choosing another quest.',
      )
    }
  }

  async function runMutation(action: string, work: () => Promise<void>) {
    await run(
      action,
      async () => {
        await work()
        await refreshAfterAction()
      },
      true,
    )
  }

  async function loadReputation() {
    if (gameOver.value) return
    reputationLoading.value = true
    reputationError.value = ''
    try {
      reputation.value = parseReputation(
        await request(`/${identifier(gameId.value)}/investigate/reputation`, 'POST'),
      )
    } catch (cause) {
      reputationError.value = reputation.value
        ? 'Reputation could not refresh. Showing last known values.'
        : 'Reputation could not be confirmed. Values are unknown.'
      throw cause
    } finally {
      reputationLoading.value = false
    }
  }

  async function refreshReputation() {
    if (!canAct.value) return
    await runMutation('reputation', loadReputation)
  }

  async function start() {
    if (autoplay.running.value) return
    await run('start', async () => {
      const payload = record(await transport('/game/start', 'POST'))
      const id = identifier(payload.gameId)
      const nextStats = statsPatch(payload)
      if (Object.keys(nextStats).length !== statKeys.length)
        throw new Error('The new game response is incomplete. Please start again.')
      reset()
      gameId.value = id
      Object.assign(stats.value, nextStats)
      await refreshAfterAction()
    })
  }

  async function resume(value: string) {
    if (autoplay.running.value) return false
    let connected = false
    await run('continue', async () => {
      const id = gameIdentifier(value)
      if (id === gameId.value && gameOver.value) {
        connected = true
        return
      }
      const payload = await transport(`/${id}/messages`)
      const nextMessages = quests(payload)
      const nextStats = statsPatch(payload)
      if (id !== gameId.value) {
        reset()
        unknownStats.value = [...statKeys]
        resumed.value = true
        gameId.value = id
      } else if (uncertain.value) {
        unknownStats.value = [...statKeys]
        resumed.value = true
        uncertain.value = false
        clearOutcome()
        clearLevelUp()
      }
      applyStats(nextStats)
      messages.value = gameOver.value ? [] : nextMessages
      boardLoaded.value = true
      connected = true
    })
    return connected
  }

  async function recover() {
    if (!active.value || !uncertain.value || pending.value || autoplay.running.value) return
    await resume(gameId.value)
  }

  async function refresh() {
    if (!active.value || gameOver.value || autoplay.running.value) return
    await run('messages', loadMessages)
  }

  async function openShop() {
    if (autoplay.running.value) return
    await fetchShop()
  }

  async function fetchShop() {
    if (!active.value || gameOver.value) return
    await run('shop', async () => {
      shopLoaded.value = false
      shop.value = []
      shop.value = items(await request(`/${identifier(gameId.value)}/shop`))
      shopLoaded.value = true
    })
  }

  function addOutcome(outcome: Omit<Outcome, 'id' | 'turn'>) {
    const entry = { ...outcome, id: ++sequence, turn: stats.value.turn }
    history.value.unshift(entry)
    history.value = history.value.slice(0, 50)
    showOutcome(entry)
  }

  async function solve(adId: string) {
    if (autoplay.running.value) return
    await solveQuest(adId)
  }

  async function solveQuest(adId: string) {
    if (
      !canMutate.value ||
      !boardLoaded.value ||
      !messages.value.some((quest) => quest.adId === adId)
    )
      return
    await runMutation(`solve:${adId}`, async () => {
      const previousGold = isStatKnown('gold') ? stats.value.gold : null
      const previousLives = isStatKnown('lives') ? stats.value.lives : null
      const response = record(
        await request(`/${identifier(gameId.value)}/solve/${identifier(adId)}`, 'POST'),
      )
      const success = flag(response.success)
      const message =
        response.message == null
          ? success
            ? 'Mission completed.'
            : 'The mission failed.'
          : text(response.message)
      addOutcome({
        kind: 'quest',
        success,
        message,
        title: success ? 'Quest accomplished' : 'Quest unsuccessful',
        goldGained:
          previousGold === null || !isStatKnown('gold')
            ? null
            : Math.max(0, stats.value.gold - previousGold),
        livesLost:
          previousLives === null || !isStatKnown('lives')
            ? null
            : Math.max(0, previousLives - stats.value.lives),
      })
    })
  }

  async function buy(itemId: string) {
    if (autoplay.running.value) return
    await buyItem(itemId)
  }

  async function buyItem(itemId: string) {
    const item = shop.value.find((entry) => entry.id === itemId)
    if (!canMutate.value || !item || !isStatKnown('gold') || stats.value.gold < item.cost) return
    await runMutation(`buy:${itemId}`, async () => {
      const response = record(
        await request(`/${identifier(gameId.value)}/shop/buy/${identifier(itemId)}`, 'POST'),
      )
      const success = flag(response.success ?? response.shoppingSuccess)
      const message =
        response.message == null
          ? success
            ? `${item.name} purchased successfully.`
            : 'The purchase was unsuccessful.'
          : text(response.message)
      if (success) {
        const owned = purchases.value.find((entry) => entry.id === itemId)
        if (owned) owned.quantity += 1
        else purchases.value.push({ ...item, quantity: 1 })
      }
      addOutcome({
        kind: 'purchase',
        success,
        message,
        title: success ? 'Purchase successful' : 'Purchase unsuccessful',
        goldGained: 0,
        livesLost: 0,
      })
    })
  }

  return {
    gameId,
    stats,
    unknownStats,
    resumed,
    reputation,
    reputationLoading,
    reputationError,
    messages,
    shop,
    purchases,
    history,
    pending,
    error,
    boardLoaded,
    messagesLoading,
    shopLoaded,
    uncertain,
    active,
    gameOver,
    canAct,
    autoplayRunning: autoplay.running,
    autoplayNextAction: autoplay.nextAction,
    autoplayStatus: autoplay.status,
    autoplayUnavailable,
    startAutoplay,
    stopAutoplay: autoplay.stop,
    lastOutcome,
    activeOutcome,
    levelUp,
    setTransport,
    isStatKnown,
    start,
    resume,
    recover,
    refresh,
    refreshReputation,
    openShop,
    solve,
    buy,
  }
})
