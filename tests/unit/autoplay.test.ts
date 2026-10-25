import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { planAutoplay, type AutoplayAction, type AutoplayState } from '../../app/utils/autoplay'
import { useAutoplay } from '../../app/composables/useAutoplay'
import type { Purchase, Quest } from '../../app/types/game'

const shop = [
  { id: 'hpot', name: 'Healing potion', cost: 50 },
  { id: 'cs', name: 'Claw sharpening', cost: 100 },
  { id: 'gas', name: 'Gasoline', cost: 100 },
  { id: 'wax', name: 'Copper plating', cost: 100 },
  { id: 'tricks', name: 'Book of tricks', cost: 100 },
  { id: 'wingpot', name: 'Wing potion', cost: 100 },
  { id: 'ch', name: 'Claw honing', cost: 300 },
  { id: 'rf', name: 'Rocket fuel', cost: 300 },
  { id: 'iron', name: 'Iron plating', cost: 300 },
  { id: 'mtrix', name: 'Book of megatricks', cost: 300 },
  { id: 'wingpotmax', name: 'Potion of awesome wings', cost: 300 },
]
const quest = (adId: string, probability: string, reward = 10, expiresIn = 5): Quest => ({
  adId,
  probability,
  reward,
  expiresIn,
  message: `Quest ${adId}`,
})
const owned = (ids: string[], quantity = 1): Purchase[] =>
  ids.map((id) => ({
    ...shop.find((item) => item.id === id)!,
    quantity,
  }))
const state = (patch: Partial<AutoplayState> = {}): AutoplayState => ({
  active: true,
  gameOver: false,
  uncertain: false,
  pending: '',
  error: '',
  boardLoaded: true,
  lives: 3,
  gold: 0,
  shopLoaded: true,
  shop,
  purchases: [],
  messages: [quest('easy', 'Sure thing')],
  ...patch,
})

describe('autoplay decisions without game actions', () => {
  it.each([
    { active: false },
    { gameOver: true },
    { uncertain: true },
    { pending: 'solve:x' },
    { error: 'offline' },
  ])('stops when the game is not ready: %j', (patch) => {
    expect(planAutoplay(state(patch)).kind).toBe('stop')
  })
  it('loads current shop prices before choosing an action', () => {
    expect(planAutoplay(state({ shopLoaded: false, lives: 1, gold: 500 }))).toMatchObject({
      kind: 'shop',
    })
  })
  it.each([0, 1, 49, 50, 99])('skips the merchant below tier 1 affordability: %s gold', (gold) => {
    expect(planAutoplay(state({ shopLoaded: false, gold }))).toMatchObject({
      kind: 'quest',
      id: 'easy',
    })
  })
  it.each([100, 299])('skips the merchant below tier 2 affordability: %s gold', (gold) => {
    expect(
      planAutoplay(
        state({
          shopLoaded: false,
          gold,
          purchases: owned(['cs', 'gas', 'wax', 'tricks', 'wingpot']),
        }),
      ),
    ).toMatchObject({ kind: 'quest', id: 'easy' })
  })
  it.each([
    { gold: 100, purchases: [] },
    { gold: 300, purchases: owned(['cs', 'gas', 'wax', 'tricks', 'wingpot']) },
    { gold: 50, lives: 1, purchases: [] },
  ])('checks the merchant when an upgrade or healing can be considered: %j', (patch) => {
    expect(planAutoplay(state({ shopLoaded: false, ...patch })).kind).toBe('shop')
  })
  it('uses the cached catalogue for consecutive purchases and skips checks with no known gold', () => {
    expect(planAutoplay(state({ gold: 200 }))).toMatchObject({ kind: 'buy', id: 'cs' })
    expect(planAutoplay(state({ gold: 100, purchases: owned(['cs']) }))).toMatchObject({
      kind: 'buy',
      id: 'gas',
    })
    expect(planAutoplay(state({ shopLoaded: false, gold: null })).kind).toBe('quest')
    expect(planAutoplay(state({ shopLoaded: false, gold: 0, lives: 1 })).kind).toBe('quest')
  })
  it('buys healing before upgrades or quests at one life', () => {
    expect(planAutoplay(state({ lives: 1, gold: 500 }))).toMatchObject({ kind: 'buy', id: 'hpot' })
    expect(planAutoplay(state({ lives: 1, gold: 50 }))).toMatchObject({ kind: 'buy', id: 'hpot' })
  })
  it('earns gold from the easiest quest if healing is unaffordable or unavailable', () => {
    expect(planAutoplay(state({ lives: 1, gold: 49 }))).toMatchObject({ kind: 'quest', id: 'easy' })
    expect(planAutoplay(state({ lives: 1, gold: 200, shop: [] }))).toMatchObject({
      kind: 'quest',
      id: 'easy',
    })
  })
  it('follows merchant order within both price tiers', () => {
    const catalogue = shop.toReversed()
    expect(planAutoplay(state({ shop: catalogue, gold: 1000 }))).toMatchObject({
      kind: 'buy',
      id: 'wingpot',
    })
    const purchases = owned(shop.filter((item) => item.cost === 100).map((item) => item.id))
    expect(planAutoplay(state({ shop: catalogue, gold: 1000, purchases }))).toMatchObject({
      kind: 'buy',
      id: 'wingpotmax',
    })
  })
  it('plans every 100-gold item once before repeating complete 300-gold cycles', () => {
    const purchases: Purchase[] = []
    const starter = shop.filter((item) => item.cost === 100)
    const advanced = shop.filter((item) => item.cost === 300)
    const sequence = [...starter, ...advanced, ...advanced, ...advanced]
    for (const expected of sequence) {
      expect(planAutoplay(state({ gold: 10000, purchases }))).toMatchObject({
        kind: 'buy',
        id: expected.id,
      })
      const existing = purchases.find((item) => item.id === expected.id)
      if (existing) existing.quantity += 1
      else purchases.push({ ...expected, quantity: 1 })
    }
    expect(purchases.filter((item) => item.cost === 100).every((item) => item.quantity === 1)).toBe(
      true,
    )
    expect(purchases.filter((item) => item.cost === 300).every((item) => item.quantity === 3)).toBe(
      true,
    )
  })
  it('finishes unbought 100-gold items even when advanced items were purchased manually', () => {
    expect(
      planAutoplay(state({ gold: 1000, purchases: owned(['cs', 'gas', 'wax', 'tricks', 'ch']) })),
    ).toMatchObject({ kind: 'buy', id: 'wingpot' })
  })
  it('does not repeat completed 100-gold items if no 300-gold items exist', () => {
    const catalogue = shop.filter((item) => item.cost === 100)
    expect(
      planAutoplay(
        state({ shop: catalogue, gold: 1000, purchases: owned(catalogue.map((item) => item.id)) }),
      ),
    ).toMatchObject({ kind: 'quest', id: 'easy' })
  })
  it('ignores other prices and handles a catalogue with no eligible upgrades', () => {
    const catalogue = [
      { id: 'cheap', name: 'Cheap item', cost: 25 },
      { id: 'other', name: 'Other item', cost: 200 },
      { id: 'expensive', name: 'Expensive item', cost: 500 },
    ]
    expect(planAutoplay(state({ shop: catalogue, gold: 1000 }))).toMatchObject({
      kind: 'quest',
      id: 'easy',
    })
    expect(planAutoplay(state({ shop: [], gold: 1000 }))).toMatchObject({
      kind: 'quest',
      id: 'easy',
    })
  })
  it('cycles a 300-gold-only catalogue when affordable', () => {
    const catalogue = [{ id: 'advanced-only', name: 'Advanced item', cost: 300 }]
    expect(planAutoplay(state({ shop: catalogue, gold: 299 }))).toMatchObject({
      kind: 'quest',
      id: 'easy',
    })
    expect(planAutoplay(state({ shop: catalogue, gold: 300 }))).toMatchObject({
      kind: 'buy',
      id: 'advanced-only',
    })
    expect(
      planAutoplay(
        state({ shop: catalogue, gold: 300, purchases: [{ ...catalogue[0]!, quantity: 2 }] }),
      ),
    ).toMatchObject({ kind: 'buy', id: 'advanced-only' })
  })
  it('postpones upgrades at one life when the healing potion is unavailable', () => {
    expect(
      planAutoplay(
        state({ lives: 1, gold: 1000, shop: shop.filter((item) => item.id !== 'hpot') }),
      ),
    ).toMatchObject({ kind: 'quest', id: 'easy' })
  })
  it('waits to afford the next upgrade instead of skipping to a cheaper later item', () => {
    expect(
      planAutoplay(
        state({
          gold: 99,
          shop: shop.map((item) => ({ ...item, cost: item.id === 'gas' ? 1 : item.cost })),
        }),
      ),
    ).toMatchObject({ kind: 'quest' })
  })
  it('uses the merchant item ids and prices instead of a fixed named upgrade list', () => {
    const catalogue = [
      { id: 'new-a', name: 'An unfamiliar upgrade', cost: 100 },
      { id: 'new-b', name: 'Another unfamiliar upgrade', cost: 100 },
      { id: 'new-c', name: 'An advanced upgrade', cost: 300 },
    ]
    expect(planAutoplay(state({ gold: 100, shop: catalogue }))).toMatchObject({
      kind: 'buy',
      id: 'new-a',
    })
    expect(
      planAutoplay(
        state({ gold: 100, shop: catalogue, purchases: [{ ...catalogue[0]!, quantity: 1 }] }),
      ),
    ).toMatchObject({ kind: 'buy', id: 'new-b' })
    expect(
      planAutoplay(
        state({
          gold: 300,
          shop: catalogue,
          purchases: catalogue.slice(0, 2).map((item) => ({ ...item, quantity: 1 })),
        }),
      ),
    ).toMatchObject({ kind: 'buy', id: 'new-c' })
  })
  it('prefers difficulty before reward and highest reward within equal difficulty', () => {
    const messages = [
      quest('risk', 'Risky', 999),
      quest('cake', 'Piece of cake', 200),
      quest('sure-low', 'Sure thing', 50),
      quest('sure-high', 'SURE THING', 90),
    ]
    expect(planAutoplay(state({ messages }))).toMatchObject({ kind: 'quest', id: 'sure-high' })
    expect(messages[0]?.adId).toBe('risk')
  })
  it.each(['help', 'rescue', 'escort', 'advertisement', 'investigate'])(
    'prefers the People keyword %s over a larger reward at the same difficulty',
    (keyword) => {
      const people = {
        ...quest('people', 'Sure thing', 1),
        message: `${keyword.toUpperCase()} the villagers.`,
      }
      expect(
        planAutoplay(state({ messages: [quest('other', 'Sure thing', 999), people] })),
      ).toMatchObject({ kind: 'quest', id: 'people' })
    },
  )
  it('keeps lower difficulty ahead of the People preference', () => {
    const people = { ...quest('people', 'Risky', 999), message: 'Rescue a villager.' }
    expect(
      planAutoplay(state({ messages: [people, quest('easy', 'Sure thing', 1)] })),
    ).toMatchObject({ kind: 'quest', id: 'easy' })
  })
  it('keeps reward and expiry tie breakers among People quests', () => {
    const low = { ...quest('low', 'Sure thing', 10, 1), message: 'Help a farmer.' }
    const high = { ...quest('high', 'Sure thing', 80, 5), message: 'Escort a merchant.' }
    expect(planAutoplay(state({ messages: [low, high] }))).toMatchObject({
      kind: 'quest',
      id: 'high',
    })
    const urgent = { ...high, adId: 'urgent', expiresIn: 1, message: 'Investigate a cave.' }
    expect(planAutoplay(state({ messages: [high, urgent] }))).toMatchObject({
      kind: 'quest',
      id: 'urgent',
    })
  })
  it('ignores expired People quests and uses nonmatching quests when needed', () => {
    const expired = { ...quest('expired', 'Sure thing', 999, 0), message: 'Rescue a villager.' }
    expect(
      planAutoplay(state({ messages: [expired, quest('other', 'Sure thing', 10)] })),
    ).toMatchObject({ kind: 'quest', id: 'other' })
  })
  it('treats cake and park as equally easy and breaks reward ties by expiry', () => {
    expect(
      planAutoplay(
        state({
          messages: [quest('cake', 'Piece of cake', 80), quest('park', 'Walk in the park', 80, 1)],
        }),
      ),
    ).toMatchObject({ kind: 'quest', id: 'park' })
  })
  it('ignores expired quests, ranks unknown labels last and refreshes an empty board', () => {
    expect(
      planAutoplay(
        state({ messages: [quest('expired', 'Sure thing', 500, 0), quest('unknown', 'Unknown')] }),
      ),
    ).toMatchObject({ kind: 'quest', id: 'unknown' })
    expect(
      planAutoplay(
        state({ messages: [quest('unknown', 'Unknown', 500), quest('known', 'Impossible', 20)] }),
      ),
    ).toMatchObject({ kind: 'quest', id: 'known' })
    expect(planAutoplay(state({ messages: [] })).kind).toBe('refresh')
    expect(planAutoplay(state({ messages: [quest('expired', 'Sure thing', 500, 0)] })).kind).toBe(
      'refresh',
    )
    expect(planAutoplay(state({ messages: [quest('prototype', '__proto__')] })).kind).toBe('quest')
  })
  it('stops on read errors and learns unknown resumed stats through quests', () => {
    expect(planAutoplay(state({ boardLoaded: false, error: 'offline' })).kind).toBe('stop')
    expect(planAutoplay(state({ shopLoaded: false, error: 'offline', gold: 100 })).kind).toBe(
      'stop',
    )
    expect(planAutoplay(state({ lives: null, gold: null }))).toMatchObject({
      kind: 'quest',
      id: 'easy',
    })
    expect(planAutoplay(state({ lives: null, gold: 500 }))).toMatchObject({
      kind: 'quest',
      id: 'easy',
    })
  })
  it('keeps playing after a declined purchase instead of repeatedly attempting it', () => {
    expect(planAutoplay(state({ gold: 500, declinedItemId: 'cs' }))).toMatchObject({
      kind: 'quest',
      id: 'easy',
    })
    expect(planAutoplay(state({ lives: 1, gold: 500, declinedItemId: 'hpot' }))).toMatchObject({
      kind: 'quest',
      id: 'easy',
    })
  })
})

describe('autoplay orchestration with inert callbacks', () => {
  afterEach(() => vi.useRealTimers())
  const fakeQuest = { kind: 'quest', id: 'fake', description: 'Fake quest' } as const
  it('stays idle until started and aborts queued work when stopped', async () => {
    vi.useFakeTimers()
    let complete!: () => void
    let signal!: AbortSignal
    const perform = vi.fn(async (_action: AutoplayAction, current: AbortSignal) => {
      expect(_action.kind).toBe('quest')
      signal = current
      await new Promise<void>((resolve) => {
        complete = resolve
      })
    })
    const scope = effectScope()
    const control = scope.run(() => useAutoplay(() => fakeQuest, perform))!
    await vi.advanceTimersByTimeAsync(10000)
    expect(perform).not.toHaveBeenCalled()
    control.start()
    control.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(perform).toHaveBeenCalledOnce()
    expect(control.status.value).toBe('Fake quest')
    control.stop()
    expect(signal.aborted).toBe(true)
    complete()
    await vi.advanceTimersByTimeAsync(10000)
    expect(perform).toHaveBeenCalledOnce()
    scope.stop()
  })
  it('waits for each action before planning the next and stops at a terminal decision', async () => {
    vi.useFakeTimers()
    let complete!: () => void
    const decide = vi
      .fn<() => AutoplayAction>()
      .mockReturnValueOnce({ kind: 'shop', description: 'Fake merchant check' })
      .mockReturnValueOnce({ kind: 'buy', id: 'fake-item', description: 'Fake purchase' })
      .mockReturnValueOnce(fakeQuest)
      .mockReturnValue({ kind: 'stop', description: 'Finished' })
    const perform = vi.fn<(action: AutoplayAction) => Promise<void>>(async () => {})
    perform.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve
        }),
    )
    const scope = effectScope()
    const control = scope.run(() => useAutoplay(decide, perform))!
    control.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(perform).toHaveBeenCalledOnce()
    expect(decide).toHaveBeenCalledOnce()
    complete()
    await vi.runAllTimersAsync()
    expect(perform.mock.calls.map(([action]) => action.kind)).toEqual(['shop', 'buy', 'quest'])
    expect(control.running.value).toBe(false)
    expect(control.status.value).toBe('Finished')
    scope.stop()
  })
  it('cancels the next timer and never runs a callback for a terminal decision', async () => {
    vi.useFakeTimers()
    const decide = vi.fn<() => AutoplayAction>(() => fakeQuest)
    const perform = vi.fn(async () => {})
    const scope = effectScope()
    const control = scope.run(() => useAutoplay(decide, perform))!
    control.start()
    control.stop()
    await vi.advanceTimersByTimeAsync(10000)
    expect(perform).not.toHaveBeenCalled()
    decide.mockReturnValue({ kind: 'stop', description: 'Finished' })
    control.start()
    expect(control.running.value).toBe(false)
    expect(control.status.value).toBe('Finished')
    expect(control.nextAction.value).toBeUndefined()
    scope.stop()
  })
  it('stops on callback errors without retrying', async () => {
    vi.useFakeTimers()
    const perform = vi.fn(async () => {
      throw new Error('Fake failure')
    })
    const scope = effectScope()
    const control = scope.run(() => useAutoplay(() => fakeQuest, perform))!
    control.start()
    await vi.advanceTimersByTimeAsync(10000)
    expect(control.running.value).toBe(false)
    expect(control.status.value).toContain('could not be completed')
    expect(perform).toHaveBeenCalledOnce()
    scope.stop()
  })
  it('does not let an old callback failure stop a new run', async () => {
    vi.useFakeTimers()
    let reject!: (reason: Error) => void
    const perform = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise((_, fail) => {
            reject = fail
          }),
      )
      .mockImplementationOnce(() => new Promise(() => {}))
    const scope = effectScope()
    const control = scope.run(() => useAutoplay(() => fakeQuest, perform))!
    control.start()
    await vi.advanceTimersByTimeAsync(0)
    control.stop()
    control.start()
    reject(new Error('Old failure'))
    await vi.advanceTimersByTimeAsync(0)
    expect(control.running.value).toBe(true)
    expect(perform).toHaveBeenCalledTimes(2)
    scope.stop()
  })
})
