import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../../app/stores/game'
import { RequestCancelledError } from '../../app/services/requestQueue'
import { ApiError, createLiveTransport } from '../../app/services/api'
import { TEST_API_URL } from '../fixtures/config'
import * as autoplayModule from '../../app/composables/useAutoplay'
import type { Transport } from '../../app/types/game'
import { decodedQuest, decodedRot13Quest, encodedQuest, rot13Quest } from '../fixtures/quests'

const start = { gameId: 'game1', lives: 3, gold: 100, score: 0, highScore: 0, turn: 0, level: 0 }
const quest = {
  adId: 'quest-1',
  message: 'Help',
  reward: 51,
  expiresIn: 7,
  probability: 'Sure thing',
}
const item = { id: 'hpot', name: 'Healing potion', cost: 50 }
const reputation = { people: 0, state: 0, underworld: 0 }
let game: ReturnType<typeof useGameStore>
let transport: ReturnType<typeof vi.fn<Transport>>

beforeEach(() => {
  setActivePinia(createPinia())
  game = useGameStore()
  transport = vi.fn<Transport>().mockImplementation(async (path) => {
    if (path === '/game/start') return { ...start }
    if (path.endsWith('/messages')) return [quest]
    if (path.endsWith('/shop')) return [item]
    if (path.endsWith('/investigate/reputation')) return { ...reputation }
    throw new Error('No fixture for this action')
  })
  game.setTransport(transport)
})

describe('game state', () => {
  it('does not mark a cancelled unsent mutation uncertain', async () => {
    await game.start()
    transport.mockRejectedValueOnce(new RequestCancelledError())
    await game.solve('quest-1')
    expect(game.uncertain).toBe(false)
    expect(game.error).toBe('')
    expect(game.history).toEqual([])
  })
  it('preserves a confirmed result when its queued message refresh is cancelled', async () => {
    await game.start()
    transport.mockResolvedValueOnce({ success: true, gold: 151, turn: 1 })
    transport.mockRejectedValueOnce(new RequestCancelledError())
    await game.solve('quest-1')
    expect(game.lastOutcome?.success).toBe(true)
    expect(game.stats.gold).toBe(151)
    expect(game.boardLoaded).toBe(false)
    expect(game.uncertain).toBe(false)
    expect(game.error).toBe('')
  })
  it('keeps autoplay dormant and blocks manual game actions while it owns control', async () => {
    expect(game.autoplayRunning).toBe(false)
    expect(game.autoplayUnavailable).toContain('Start or continue')
    await game.start()
    expect(game.autoplayUnavailable).toBe('')
    transport.mockClear()
    game.autoplayRunning = true
    expect(game.canAct).toBe(false)
    await game.start()
    expect(await game.resume('another')).toBe(false)
    await game.solve('quest-1')
    await game.buy('hpot')
    await game.openShop()
    await game.refresh()
    await game.refreshReputation()
    expect(transport).not.toHaveBeenCalled()
    game.stopAutoplay()
    expect(game.canAct).toBe(true)
  })
  describe('continuing adventures', () => {
    it('loads an existing id using documented endpoints without starting a new game or assuming stats', async () => {
      expect(await game.resume('  saved001  ')).toBe(true)
      expect(transport.mock.calls.map(([path, method]) => [path, method])).toEqual([
        ['/saved001/messages', undefined],
      ])
      expect(game.gameId).toBe('saved001')
      expect(game.messages).toHaveLength(1)
      expect(game.reputation).toBeNull()
      expect(game.resumed).toBe(true)
      expect(game.unknownStats).toEqual(['lives', 'gold', 'score', 'turn', 'level'])
      expect(game.gameOver).toBe(false)
      expect(game.canAct).toBe(true)
      await game.openShop()
      const calls = transport.mock.calls.length
      await game.buy('hpot')
      expect(transport).toHaveBeenCalledTimes(calls)
    })

    it.each([true, false])(
      'learns stats from subsequent responses without inventing a first quest delta: success=%s',
      async (success) => {
        await game.resume('saved001')
        transport.mockResolvedValueOnce({
          success,
          lives: 2,
          gold: 250,
          score: 500,
          highScore: 800,
          turn: 12,
          level: 4,
        })
        await game.solve('quest-1')
        expect(game.unknownStats).toEqual([])
        expect(game.stats).toEqual({
          lives: 2,
          gold: 250,
          score: 500,
          turn: 12,
          level: 4,
        })
        expect(game.lastOutcome).toMatchObject({ goldGained: null, livesLost: null, turn: 12 })
        expect(game.levelUp).toBeUndefined()
        transport.mockResolvedValueOnce({
          success,
          lives: 1,
          gold: success ? 301 : 250,
          turn: 13,
          level: 5,
        })
        await game.solve('quest-1')
        expect(game.lastOutcome).toMatchObject({
          goldGained: success ? 51 : 0,
          livesLost: 1,
          turn: 13,
        })
        expect(game.levelUp).toBe(5)
      },
    )

    it('recognizes zero lives from a continued game lookup and skips further queries', async () => {
      transport.mockResolvedValueOnce({
        messages: [quest],
        lives: 0,
        score: 0,
        turn: 9,
        gold: 0,
        highScore: 20,
      })
      await game.resume('finished')
      expect(game.gameOver).toBe(true)
      expect(game.stats).toMatchObject({ lives: 0, gold: 0, score: 0, turn: 9 })
      expect(game.unknownStats).toEqual(['level'])
      expect(game.messages).toEqual([])
      expect(transport.mock.calls.map(([path]) => path)).toEqual(['/finished/messages'])
    })

    it('keeps the current adventure intact when the id is invalid or lookup fails', async () => {
      await game.start()
      const originalStats = { ...game.stats }
      transport.mockClear()
      for (const id of ['', '../x', 'x/y']) expect(await game.resume(id)).toBe(false)
      expect(transport).not.toHaveBeenCalled()
      transport.mockRejectedValueOnce(new Error('Cannot find that adventure'))
      expect(await game.resume('missing')).toBe(false)
      expect(game.gameId).toBe('game1')
      expect(game.stats).toEqual(originalStats)
      expect(game.messages).toHaveLength(1)
      expect(game.error).toBe('Cannot find that adventure')
      transport.mockResolvedValueOnce({ messages: 'bad' })
      expect(await game.resume('invalid')).toBe(false)
      expect(game.gameId).toBe('game1')
    })

    it('clears another adventure’s local history and notices only after connecting successfully', async () => {
      await game.start()
      transport.mockResolvedValueOnce({ success: true, gold: 151, level: 1, turn: 1 })
      await game.solve('quest-1')
      expect(game.history).toHaveLength(1)
      await game.resume('game1')
      expect(game.history).toHaveLength(1)
      transport.mockRejectedValueOnce(new Error('offline'))
      await game.resume('newid')
      expect(game.history).toHaveLength(1)
      await game.resume('newid')
      expect(game.history).toEqual([])
      expect(game.purchases).toEqual([])
      expect(game.activeOutcome).toBeUndefined()
      expect(game.levelUp).toBeUndefined()
      expect(game.isStatKnown('gold')).toBe(false)
      await game.start()
      expect(game.resumed).toBe(false)
      expect(game.unknownStats).toEqual([])
    })

    it('recovers an unconfirmed adventure on explicit reconnect without inventing stats', async () => {
      transport.mockResolvedValueOnce([quest])
      expect(await game.resume('saved')).toBe(true)
      expect(game.boardLoaded).toBe(true)
      expect(game.reputationError).toBe('')
      game.uncertain = true
      await game.resume('saved')
      expect(game.uncertain).toBe(false)
      expect(game.error).toBe('')
      expect(game.unknownStats).toEqual(['lives', 'gold', 'score', 'turn', 'level'])
      expect(game.canAct).toBe(true)
    })
  })
  describe('temporary notifications', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => {
      game.$dispose()
      vi.useRealTimers()
    })

    it('celebrates a level increase from a purchase and hides both messages after five seconds', async () => {
      await game.start()
      await game.openShop()
      transport.mockResolvedValueOnce({ shoppingSuccess: true, gold: 50, level: 2, turn: 1 })
      await game.buy('hpot')
      expect(game.levelUp).toBe(2)
      expect(game.activeOutcome?.kind).toBe('purchase')
      await vi.advanceTimersByTimeAsync(4999)
      expect(game.levelUp).toBe(2)
      expect(game.activeOutcome?.success).toBe(true)
      await vi.advanceTimersByTimeAsync(1)
      expect(game.levelUp).toBeUndefined()
      expect(game.activeOutcome).toBeUndefined()
      expect(game.lastOutcome?.kind).toBe('purchase')
      expect(game.history).toHaveLength(1)
      expect(game.stats.level).toBe(2)
    })

    it.each([true, false])(
      'expires quest results while preserving the journal: success=%s',
      async (success) => {
        await game.start()
        transport.mockResolvedValueOnce({
          success,
          lives: success ? 3 : 2,
          gold: success ? 151 : 100,
          turn: 1,
        })
        await game.solve('quest-1')
        expect(game.activeOutcome?.success).toBe(success)
        await vi.advanceTimersByTimeAsync(5000)
        expect(game.activeOutcome).toBeUndefined()
        expect(game.history[0]).toMatchObject({ success, livesLost: success ? 0 : 1 })
      },
    )

    it('gives a newer result and level increase their own full five seconds', async () => {
      await game.start()
      await game.openShop()
      transport.mockResolvedValueOnce({ shoppingSuccess: true, gold: 50, level: 1, turn: 1 })
      await game.buy('hpot')
      const previousId = game.activeOutcome?.id
      await vi.advanceTimersByTimeAsync(4000)
      transport.mockResolvedValueOnce({ shoppingSuccess: true, gold: 0, level: 2, turn: 2 })
      await game.buy('hpot')
      await vi.advanceTimersByTimeAsync(1000)
      expect(game.levelUp).toBe(2)
      expect(game.activeOutcome?.id).not.toBe(previousId)
      expect(game.activeOutcome).toBeDefined()
      await vi.advanceTimersByTimeAsync(4000)
      expect(game.levelUp).toBeUndefined()
      expect(game.activeOutcome).toBeUndefined()
      expect(game.history).toHaveLength(2)
    })

    it('detects increases from any endpoint without repeating celebrations for unchanged or lower levels', async () => {
      await game.start()
      expect(game.levelUp).toBeUndefined()
      transport.mockResolvedValueOnce({ messages: [quest], level: 3 })
      await game.refresh()
      expect(game.levelUp).toBe(3)
      await vi.advanceTimersByTimeAsync(4000)
      transport.mockResolvedValueOnce({ messages: [quest], level: 3 })
      await game.refresh()
      await vi.advanceTimersByTimeAsync(1000)
      expect(game.levelUp).toBeUndefined()
      transport.mockResolvedValueOnce({ messages: [quest], level: 2 })
      await game.refresh()
      expect(game.levelUp).toBeUndefined()
      transport.mockResolvedValueOnce({ items: [item], level: 4 })
      await game.openShop()
      expect(game.levelUp).toBe(4)
    })

    it('clears notices and their timers when restarting and treats the initial level as a baseline', async () => {
      await game.start()
      transport.mockResolvedValueOnce({ success: true, level: 1, turn: 1 })
      await game.solve('quest-1')
      expect(game.activeOutcome).toBeDefined()
      expect(game.levelUp).toBe(1)
      transport.mockResolvedValueOnce({ ...start, level: 7 })
      await game.start()
      expect(game.activeOutcome).toBeUndefined()
      expect(game.levelUp).toBeUndefined()
      expect(game.history).toEqual([])
      expect(vi.getTimerCount()).toBe(0)
    })

    it('cleans up notification timers when the store is disposed', async () => {
      await game.start()
      transport.mockResolvedValueOnce({ success: true, level: 1, turn: 1 })
      await game.solve('quest-1')
      game.$dispose()
      expect(vi.getTimerCount()).toBe(0)
    })
  })
  it('uses a configured live transport only when starting a game', async () => {
    setActivePinia(createPinia())
    const liveGame = useGameStore()
    liveGame.setTransport(createLiveTransport(TEST_API_URL))
    expect(fetch).not.toHaveBeenCalled()
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(start)))
      .mockResolvedValueOnce(new Response(JSON.stringify([quest])))
    await liveGame.start()
    expect(fetch).toHaveBeenCalledWith(
      `${TEST_API_URL}/game/start`,
      expect.objectContaining({ method: 'POST' }),
    )
    expect(liveGame.active).toBe(true)
    expect(liveGame.messages).toHaveLength(1)
  })
  it('starts and loads messages, then replaces the previous adventure on restart', async () => {
    await game.start()
    expect(game.active).toBe(true)
    expect({ gameId: game.gameId, ...game.stats }).toEqual({
      gameId: 'game1',
      lives: 3,
      gold: 100,
      score: 0,
      turn: 0,
      level: 0,
    })
    expect(game.stats).not.toHaveProperty('highScore')
    expect(game.messages).toHaveLength(1)
    expect(game.reputation).toBeNull()
    await game.openShop()
    transport.mockResolvedValueOnce({ shoppingSuccess: true, gold: 50, turn: 1 })
    await game.buy('hpot')
    transport.mockResolvedValueOnce({
      gameId: 'game1',
      lives: 3,
      gold: 100,
      score: 0,
      turn: 0,
      level: 0,
    })
    await game.start()
    expect(game.purchases).toEqual([])
    expect(game.history).toEqual([])
    expect(game.stats.gold).toBe(100)
  })
  it('updates tracked stats on list endpoints while ignoring highScore', async () => {
    await game.start()
    transport.mockResolvedValueOnce({
      messages: [quest],
      lives: 2,
      gold: 0,
      score: 22,
      highScore: 0,
      turn: 9,
    })
    await game.refresh()
    expect(game.stats).toEqual({ lives: 2, gold: 0, score: 22, turn: 9, level: 0 })
    transport.mockResolvedValueOnce({
      items: [item],
      lives: 1,
      gold: 101,
      score: 44,
      highScore: 80,
      turn: 10,
    })
    await game.openShop()
    expect(game.stats).toMatchObject({ lives: 1, gold: 101, score: 44, turn: 10 })
    expect(game.stats).not.toHaveProperty('highScore')
  })
  it('shows quest success, actual gold gained and refreshed messages', async () => {
    await game.start()
    transport.mockResolvedValueOnce({
      success: true,
      gold: 151,
      score: 51,
      highScore: 0,
      lives: 3,
      turn: 1,
      message: 'Saved the realm!',
    })
    transport.mockResolvedValueOnce([])
    await game.solve('quest-1')
    expect(game.lastOutcome).toMatchObject({
      success: true,
      message: 'Saved the realm!',
      goldGained: 51,
      turn: 1,
    })
    expect(game.stats).not.toHaveProperty('highScore')
    expect(game.messages).toEqual([])
    expect(game.reputation).toBeNull()
    expect(transport).not.toHaveBeenCalledWith('/game1/investigate/reputation', 'POST')
  })
  it.each([
    { encoded: encodedQuest, decoded: decodedQuest },
    { encoded: rot13Quest, decoded: decodedRot13Quest },
  ])(
    'solves an encrypted quest using its decoded id: $encoded.encrypted',
    async ({ encoded, decoded }) => {
      await game.start()
      transport.mockResolvedValueOnce([encoded])
      await game.refresh()
      expect(game.messages).toEqual([decoded])
      transport.mockResolvedValueOnce({ success: true, gold: start.gold + decoded.reward, turn: 1 })
      await game.solve(decoded.adId)
      expect(transport).toHaveBeenCalledWith(`/game1/solve/${decoded.adId}`, 'POST')
      expect(game.lastOutcome?.goldGained).toBe(decoded.reward)
      expect(game.uncertain).toBe(false)
    },
  )
  it.each([
    { returnedLives: 2, lost: 1 },
    { returnedLives: 0, lost: 3 },
    { returnedLives: 3, lost: 0 },
    { returnedLives: undefined, lost: 0 },
  ])(
    'records the life loss from the solve response: $returnedLives',
    async ({ returnedLives, lost }) => {
      await game.start()
      transport.mockResolvedValueOnce({
        success: false,
        turn: 1,
        ...(returnedLives === undefined ? {} : { lives: returnedLives }),
      })
      await game.solve('quest-1')
      expect(game.lastOutcome?.livesLost).toBe(lost)
      expect(game.history[0]?.livesLost).toBe(lost)
      expect(game.stats.lives).toBe(returnedLives ?? 3)
    },
  )
  it('records quantities for successful purchases and displays API messages', async () => {
    await game.start()
    await game.openShop()
    transport.mockResolvedValueOnce({
      success: true,
      gold: 50,
      score: 20,
      highScore: 30,
      turn: 1,
      message: 'A fine purchase',
    })
    await game.buy('hpot')
    expect(game.lastOutcome?.message).toBe('A fine purchase')
    transport.mockResolvedValueOnce({ shoppingSuccess: 'true', gold: 0, lives: 4, turn: 2 })
    await game.buy('hpot')
    expect(game.purchases[0]?.quantity).toBe(2)
    expect(game.lastOutcome?.message).toBe('Healing potion purchased successfully.')
    expect(game.stats).toMatchObject({ gold: 0, lives: 4, turn: 2, score: 20 })
    expect(game.stats).not.toHaveProperty('highScore')
  })
  it('keeps failed purchases out of the inventory but applies returned stats', async () => {
    await game.start()
    await game.openShop()
    transport.mockResolvedValueOnce({ shoppingSuccess: false, gold: 90, turn: 1 })
    await game.buy('hpot')
    expect(game.purchases).toEqual([])
    expect(game.stats.gold).toBe(90)
    expect(game.lastOutcome).toMatchObject({
      success: false,
      message: 'The purchase was unsuccessful.',
    })
  })
  it('blocks missing ids, unaffordable items, and actions before start', async () => {
    await game.refresh()
    await game.openShop()
    await game.solve('bad')
    await game.buy('bad')
    expect(transport).not.toHaveBeenCalled()
    await game.start()
    await game.openShop()
    game.stats.gold = 49
    transport.mockClear()
    await game.buy('hpot')
    await game.buy('bad')
    await game.solve('bad')
    expect(transport).not.toHaveBeenCalled()
  })
  it('prevents overlapping actions and transport changes while pending', async () => {
    let release!: (payload: typeof start) => void
    transport.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    const work = game.start()
    await game.start()
    game.setTransport(vi.fn())
    release(start)
    await work
    expect(transport).toHaveBeenCalledTimes(2)
  })
  it('keeps last loaded messages disabled after a refresh failure without discarding a completed result', async () => {
    await game.start()
    transport.mockResolvedValueOnce({ success: true, gold: 151, turn: 1 })
    transport.mockRejectedValueOnce(new Error('offline'))
    await game.solve('quest-1')
    expect(game.lastOutcome?.success).toBe(true)
    expect(game.messages).toHaveLength(1)
    expect(game.boardLoaded).toBe(false)
    expect(game.uncertain).toBe(false)
    expect(game.error).toContain('action is complete')
    const calls = transport.mock.calls.length
    await game.solve('quest-1')
    expect(transport).toHaveBeenCalledTimes(calls)
    await game.refresh()
    expect(game.boardLoaded).toBe(true)
  })
  it('keeps messages and last investigated reputation visible during a quest refresh', async () => {
    await game.start()
    await game.refreshReputation()
    const previousMessages = game.messages
    const previousReputation = game.reputation
    let releaseMessages!: (value: (typeof quest)[]) => void
    const messageRequest = new Promise<(typeof quest)[]>((resolve) => {
      releaseMessages = resolve
    })
    transport.mockClear()
    transport.mockResolvedValueOnce({ success: true, lives: 3, gold: 151, score: 51, turn: 1 })
    transport.mockReturnValueOnce(messageRequest)
    const work = game.solve('quest-1')
    await vi.waitFor(() => expect(game.messagesLoading).toBe(true))
    expect(game.messages).toBe(previousMessages)
    expect(game.reputation).toBe(previousReputation)
    expect(game.reputationLoading).toBe(false)
    expect(game.stats.gold).toBe(151)
    expect(game.boardLoaded).toBe(true)
    expect(game.canAct).toBe(false)
    releaseMessages([{ ...quest, expiresIn: 6 }])
    await work
    expect(game.messages[0]?.expiresIn).toBe(6)
    expect(game.messagesLoading).toBe(false)
    expect(game.canAct).toBe(true)
    expect(transport.mock.calls.map(([path]) => path)).toEqual([
      '/game1/solve/quest-1',
      '/game1/messages',
    ])
  })

  it('does not partially apply invalid stats and pauses uncertain mutations', async () => {
    await game.start()
    transport.mockResolvedValueOnce({ success: true, gold: 151, lives: -1 })
    await game.solve('quest-1')
    expect(game.stats.gold).toBe(100)
    expect(game.uncertain).toBe(true)
    expect(game.canAct).toBe(false)
    expect(game.pending).toBe('')
    await game.start()
    expect(game.uncertain).toBe(false)
  })
  it('handles start, board and shop failures with recoverable errors', async () => {
    transport.mockRejectedValueOnce(new Error('offline'))
    await game.start()
    expect(game.error).toBe('offline')
    expect(game.active).toBe(false)
    transport.mockResolvedValueOnce({ gameId: 'x', gold: 5 })
    await game.start()
    expect(game.error).toContain('incomplete')
    await game.start()
    transport.mockRejectedValueOnce('error')
    await game.refresh()
    expect(game.error).toContain('Something went wrong')
    transport.mockRejectedValueOnce(new Error('shop offline'))
    await game.openShop()
    expect(game.shopLoaded).toBe(false)
    expect(game.error).toBe('shop offline')
  })
  it('caps the journal and clears it when starting a new adventure', async () => {
    await game.start()
    for (let n = 0; n < 52; n++) {
      transport.mockResolvedValueOnce({ success: true, gold: 100, turn: n + 1 })
      await game.solve('quest-1')
    }
    expect(game.history).toHaveLength(50)
    await game.start()
    expect(game.active).toBe(true)
    expect(game.history).toEqual([])
    expect(game.stats.turn).toBe(0)
  })
  it('stops further queries after losing the final life and preserves the outcome', async () => {
    await game.start()
    await game.refreshReputation()
    game.reputationError = 'A previous reputation refresh failed.'
    transport.mockClear()
    transport.mockResolvedValueOnce({ success: false, lives: 0, turn: 1 })
    transport.mockRejectedValue(new Error('The realm could not complete this action (410).'))
    await game.solve('quest-1')
    expect(transport.mock.calls.map(([path]) => path)).toEqual(['/game1/solve/quest-1'])
    expect(game.reputation).toEqual(reputation)
    expect(game.stats.turn).toBe(1)
    expect(game.gameOver).toBe(true)
    expect(game.messages).toEqual([])
    expect(game.lastOutcome).toMatchObject({
      success: false,
      goldGained: 0,
      livesLost: 3,
      turn: 1,
      message: 'The mission failed.',
    })
    expect(game.error).toBe('')
    expect(game.reputationError).toBe('')
    expect(game.uncertain).toBe(false)
    await game.refresh()
    await game.refreshReputation()
    await game.openShop()
    expect(await game.resume('game1')).toBe(true)
    await game.solve('quest-1')
    await game.buy('hpot')
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('refreshes only messages after a failed quest with lives remaining', async () => {
    await game.start()
    transport.mockClear()
    transport.mockResolvedValueOnce({ success: false, lives: 1, turn: 1 })
    await game.solve('quest-1')
    expect(transport.mock.calls.map(([path]) => path)).toEqual([
      '/game1/solve/quest-1',
      '/game1/messages',
    ])
    expect(game.reputation).toBeNull()
    expect(game.gameOver).toBe(false)
  })

  it('does not refresh messages after a manual investigation reports zero lives', async () => {
    await game.start()
    transport.mockClear()
    transport.mockResolvedValueOnce({ ...reputation, lives: 0, turn: 1 })
    await game.refreshReputation()
    expect(transport.mock.calls.map(([path]) => path)).toEqual(['/game1/investigate/reputation'])
    expect(game.gameOver).toBe(true)
    expect(game.error).toBe('')
  })

  it('does not query a new game that starts with zero lives, but can start again', async () => {
    transport.mockResolvedValueOnce({ ...start, lives: 0 })
    await game.start()
    expect(transport.mock.calls.map(([path]) => path)).toEqual(['/game/start'])
    expect(game.gameOver).toBe(true)
    await game.start()
    expect(game.gameOver).toBe(false)
    expect(game.messages).toHaveLength(1)
  })
  it('preserves the completed quest and last reputation when a manual investigation is unconfirmed', async () => {
    await game.start()
    await game.refreshReputation()
    transport.mockResolvedValueOnce({ success: true, gold: 151, turn: 1 })
    await game.solve('quest-1')
    transport.mockClear()
    transport.mockRejectedValueOnce(new Error('reputation unavailable'))
    await game.refreshReputation()
    expect(game.lastOutcome?.success).toBe(true)
    expect(game.stats.gold).toBe(151)
    expect(game.reputation).toEqual(reputation)
    expect(game.reputationError).toContain('last known')
    expect(game.uncertain).toBe(true)
    expect(game.canAct).toBe(false)
    expect(game.reputationLoading).toBe(false)
    await game.refreshReputation()
    await game.solve('quest-1')
    await game.buy('hpot')
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('keeps reputation unknown until requested and clears last investigated values on restart', async () => {
    await game.refreshReputation()
    expect(transport).not.toHaveBeenCalled()
    await game.start()
    expect(game.reputation).toBeNull()
    transport.mockRejectedValueOnce(new Error('offline'))
    await game.refreshReputation()
    expect(game.reputation).toBeNull()
    expect(game.reputationError).toContain('unknown')
    expect(game.uncertain).toBe(true)
    await game.start()
    await game.refreshReputation()
    expect(game.reputation).toEqual(reputation)
    await game.start()
    expect(game.reputation).toBeNull()
    expect(game.reputationError).toBe('')
    expect(game.reputationLoading).toBe(false)
  })

  it('rejects invalid reputation atomically and does not investigate purchases', async () => {
    await game.start()
    await game.openShop()
    transport.mockClear()
    transport.mockResolvedValueOnce({ shoppingSuccess: true, gold: 50, turn: 1 })
    await game.buy('hpot')
    expect(transport.mock.calls.map(([path]) => path)).toEqual([
      '/game1/shop/buy/hpot',
      '/game1/messages',
    ])
    await game.refreshReputation()
    transport.mockResolvedValueOnce({ people: 1, state: NaN, underworld: -1 })
    await game.refreshReputation()
    expect(game.reputation).toEqual(reputation)
    expect(game.reputationError).toContain('last known')
    expect(game.uncertain).toBe(true)
  })
  it('investigates only on demand, applies returned stats and refreshes expiring quests', async () => {
    await game.start()
    expect(transport.mock.calls.map(([path]) => path)).toEqual(['/game/start', '/game1/messages'])
    transport.mockClear()
    transport.mockResolvedValueOnce({
      people: 0.2,
      state: -0.1,
      underworld: 0,
      turn: 4,
      gold: 80,
      lives: 2,
      score: 30,
      level: 1,
    })
    transport.mockResolvedValueOnce([{ ...quest, expiresIn: 3 }])
    await game.refreshReputation()
    expect(transport.mock.calls.map(([path, method]) => [path, method])).toEqual([
      ['/game1/investigate/reputation', 'POST'],
      ['/game1/messages', 'GET'],
    ])
    expect(game.stats).toEqual({ lives: 2, gold: 80, score: 30, turn: 4, level: 1 })
    expect(game.reputation).toEqual({ people: 0.2, state: -0.1, underworld: 0 })
    expect(game.messages[0]?.expiresIn).toBe(3)
    transport.mockResolvedValueOnce({ ...reputation })
    await game.refreshReputation()
    expect(game.stats.turn).toBe(4)
  })
  it('prevents overlapping investigations and keeps a successful investigation when board refresh fails', async () => {
    await game.start()
    let release!: (value: typeof reputation) => void
    transport.mockClear()
    transport.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    const work = game.refreshReputation()
    expect(game.reputationLoading).toBe(true)
    await game.refreshReputation()
    await game.solve('quest-1')
    expect(transport).toHaveBeenCalledTimes(1)
    transport.mockRejectedValueOnce(new Error('offline'))
    release(reputation)
    await work
    expect(game.reputation).toEqual(reputation)
    expect(game.uncertain).toBe(false)
    expect(game.error).toContain('action is complete')
    expect(game.boardLoaded).toBe(false)
  })
})

describe('recovering after autoplay errors without starting autoplay', () => {
  it.each(['quest', 'purchase', 'reputation'])(
    'unlocks controls after an explicit API rejection during %s',
    async (action) => {
      await game.start()
      await game.openShop()
      let reject!: (cause: Error) => void
      transport.mockImplementationOnce(
        () =>
          new Promise((_, fail) => {
            reject = fail
          }),
      )
      const request =
        action === 'quest'
          ? game.solve('quest-1')
          : action === 'purchase'
            ? game.buy('hpot')
            : game.refreshReputation()
      game.autoplayRunning = true
      reject(new ApiError(429))
      await request
      expect(game.autoplayRunning).toBe(false)
      expect(game.pending).toBe('')
      expect(game.uncertain).toBe(false)
      expect(game.canAct).toBe(true)
      expect(game.autoplayUnavailable).toBe('')
      expect(game.autoplayStatus).toContain('stopped after an error')
      expect(game.stats.gold).toBe(100)
      expect(game.history).toEqual([])
      expect(game.boardLoaded).toBe(false)
      const calls = transport.mock.calls.length
      await game.refresh()
      expect(transport).toHaveBeenCalledTimes(calls + 1)
      expect(game.boardLoaded).toBe(true)
      expect(game.error).toBe('')
    },
  )

  it.each(['messages', 'shop'])('releases control after a %s read error', async (action) => {
    await game.start()
    let reject!: (cause: Error) => void
    transport.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail
        }),
    )
    const request = action === 'messages' ? game.refresh() : game.openShop()
    game.autoplayRunning = true
    reject(new ApiError(500))
    await request
    expect(game.autoplayRunning).toBe(false)
    expect(game.pending).toBe('')
    expect(game.uncertain).toBe(false)
    expect(game.canAct).toBe(true)
    expect(game.autoplayUnavailable).toBe('')
  })

  it('stops after a follow-up read fails while preserving the confirmed quest result', async () => {
    await game.start()
    transport.mockResolvedValueOnce({ success: true, lives: 2, gold: 151, score: 51, turn: 1 })
    let reject!: (cause: Error) => void
    transport.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail
        }),
    )
    const request = game.solve('quest-1')
    await vi.waitFor(() => expect(game.messagesLoading).toBe(true))
    game.autoplayRunning = true
    reject(new ApiError(503))
    await request
    expect(game.autoplayRunning).toBe(false)
    expect(game.canAct).toBe(true)
    expect(game.autoplayUnavailable).toBe('')
    expect(game.uncertain).toBe(false)
    expect(game.lastOutcome?.goldGained).toBe(51)
    expect(game.stats.turn).toBe(1)
  })

  it.each([new ApiError(408), new ApiError(500), new Error('Response lost')])(
    'recovers an ambiguous action with unknown stats and never replays it: %s',
    async (cause) => {
      await game.start()
      await game.openShop()
      game.purchases = [{ ...item, quantity: 1 }]
      transport.mockRejectedValueOnce(cause)
      await game.solve('quest-1')
      expect(game.uncertain).toBe(true)
      expect(game.canAct).toBe(false)
      expect(game.autoplayUnavailable).toContain('unconfirmed')
      transport.mockClear()
      await game.recover()
      expect(transport.mock.calls.map(([path, method]) => [path, method])).toEqual([
        ['/game1/messages', undefined],
      ])
      expect(game.gameId).toBe('game1')
      expect(game.uncertain).toBe(false)
      expect(game.unknownStats).toEqual(['lives', 'gold', 'score', 'turn', 'level'])
      expect(game.canAct).toBe(true)
      expect(game.autoplayUnavailable).toBe('')
      expect(game.boardLoaded).toBe(true)
      expect(game.purchases).toEqual([{ ...item, quantity: 1 }])
      expect(game.history).toEqual([])
      await game.buy('hpot')
      expect(transport).toHaveBeenCalledOnce()
      transport.mockResolvedValueOnce({
        success: true,
        lives: 2,
        gold: 201,
        score: 101,
        turn: 2,
        level: 1,
      })
      await game.solve('quest-1')
      expect(game.unknownStats).toEqual([])
      expect(game.lastOutcome?.goldGained).toBeNull()
      expect(game.lastOutcome?.livesLost).toBeNull()
      expect(game.stats.turn).toBe(2)
    },
  )

  it('preserves the recovery option after a failed or malformed recovery response', async () => {
    await game.start()
    transport.mockRejectedValueOnce(new Error('Response lost'))
    await game.solve('quest-1')
    const stats = { ...game.stats }
    for (const response of [
      new ApiError(500),
      { messages: [quest], lives: -1 },
      { messages: [{ ...quest, adId: '../invalid' }] },
    ]) {
      if (response instanceof Error) transport.mockRejectedValueOnce(response)
      else transport.mockResolvedValueOnce(response)
      await game.recover()
      expect(game.uncertain).toBe(true)
      expect(game.pending).toBe('')
      expect(game.stats).toEqual(stats)
      expect(game.canAct).toBe(false)
    }
    await game.recover()
    expect(game.canAct).toBe(true)
  })

  it('applies authoritative stats supplied during recovery and does not query a finished game again', async () => {
    await game.start()
    transport.mockRejectedValueOnce(new Error('Response lost'))
    await game.solve('quest-1')
    transport.mockClear()
    transport.mockResolvedValueOnce({
      messages: [],
      lives: 0,
      gold: 100,
      score: 0,
      turn: 1,
      level: 0,
    })
    await game.recover()
    expect(game.gameOver).toBe(true)
    expect(game.unknownStats).toEqual([])
    expect(game.messages).toEqual([])
    expect(transport).toHaveBeenCalledOnce()
  })
  it('allows an explicit restart after a recoverable error, using an inert autoplay start callback', async () => {
    const original = autoplayModule.useAutoplay
    const begin = vi.fn()
    const composable = vi
      .spyOn(autoplayModule, 'useAutoplay')
      .mockImplementation((decide, perform) => ({
        ...original(decide, perform),
        start: begin,
      }))
    const adventure = useGameStore(createPinia())
    try {
      adventure.setTransport(transport)
      await adventure.start()
      transport.mockClear()
      adventure.error = 'A previous request failed.'
      adventure.uncertain = true
      adventure.startAutoplay()
      expect(begin).not.toHaveBeenCalled()
      expect(adventure.error).toBe('A previous request failed.')
      adventure.uncertain = false
      adventure.pending = 'messages'
      adventure.startAutoplay()
      expect(begin).not.toHaveBeenCalled()
      adventure.pending = ''
      adventure.boardLoaded = false
      adventure.startAutoplay()
      expect(begin).toHaveBeenCalledOnce()
      expect(adventure.error).toBe('')
      expect(transport).not.toHaveBeenCalled()
    } finally {
      adventure.$dispose()
      composable.mockRestore()
    }
  })
})
