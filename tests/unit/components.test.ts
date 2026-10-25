import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import PlayerStats from '../../app/components/PlayerStats.vue'
import ReputationStats from '../../app/components/ReputationStats.vue'
import AutoplayControls from '../../app/components/AutoplayControls.vue'
import OutcomeNotice from '../../app/components/OutcomeNotice.vue'
import LevelNotice from '../../app/components/LevelNotice.vue'
import ContinueAdventureModal from '../../app/components/ContinueAdventureModal.vue'
import QuestBoard from '../../app/components/QuestBoard.vue'
import DragonPanel from '../../app/components/DragonPanel.vue'
import ShopModal from '../../app/components/ShopModal.vue'
import { useGameStore } from '../../app/stores/game'
import { uiStubs } from './uiStubs'

const global = {
  stubs: {
    ...uiStubs,
    OutcomeNotice,
    LevelNotice,
  },
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('visible game behavior', () => {
  it('renders autoplay idle and wires its controls without starting the feature', async () => {
    const game = useGameStore()
    const start = vi.spyOn(game, 'startAutoplay').mockImplementation(() => {})
    const view = mount(AutoplayControls, { global })
    expect(start).not.toHaveBeenCalled()
    expect(view.get('button').attributes('disabled')).toBeDefined()
    expect(view.text()).toContain('Start or continue an adventure first')
    game.gameId = 'fixture'
    game.stats.lives = 3
    game.boardLoaded = true
    await view.vm.$nextTick()
    expect(view.get('button').attributes('disabled')).toBeUndefined()
    await view.get('button').trigger('click')
    expect(start).toHaveBeenCalledOnce()
    game.autoplayRunning = true
    game.autoplayStatus = 'A simulated decision.'
    await view.vm.$nextTick()
    expect(view.get('button').text()).toContain('Stop autoplay')
    expect(view.get('[role="status"]').text()).toContain('A simulated decision')
    await view.get('button').trigger('click')
    expect(game.autoplayRunning).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('renders the four player stats and reacts to exact updates', async () => {
    const view = mount(PlayerStats, { global })
    expect(view.text()).toContain('—')
    const game = useGameStore()
    game.gameId = 'game1'
    game.stats = { lives: 0, gold: 0, score: 23, turn: 4, level: 1 }
    await view.vm.$nextTick()
    expect(view.get('[data-testid="stat-lives"]').text()).toBe('0')
    expect(view.findAll('dt').map((label) => label.text())).toEqual([
      'Lives',
      'Gold',
      'Score',
      'Turn',
    ])
    expect(view.get('[data-testid="stat-score"]').text()).toBe('23')
  })
  it('renders results as plain text and announces success and gained gold', () => {
    const view = mount(OutcomeNotice, {
      global,
      props: {
        outcome: {
          id: 1,
          kind: 'quest',
          success: true,
          title: 'Quest accomplished',
          message: '<img src=x onerror=alert(1)>',
          goldGained: 51,
          livesLost: 0,
          turn: 1,
        },
      },
    })
    expect(view.find('img').exists()).toBe(false)
    expect(view.text()).toContain('Success: true')
    expect(view.text()).toContain('+51')
    expect(view.attributes('role')).toBe('status')
  })
  it('shows welcome, loading, failed fetch, empty, and game-over board states', async () => {
    const view = mount(QuestBoard, { global })
    const game = useGameStore()
    expect(view.text()).toContain('story is yet')
    game.gameId = 'game1'
    game.stats.lives = 3
    game.pending = 'messages'
    await view.vm.$nextTick()
    expect(view.text()).toContain('Fetching requests')
    game.pending = ''
    await view.vm.$nextTick()
    expect(view.text()).toContain('out of reach')
    game.boardLoaded = true
    await view.vm.$nextTick()
    expect(view.find('.board-empty').exists()).toBe(true)
    expect(view.findAll('article')).toHaveLength(0)
    game.stats.lives = 0
    await view.vm.$nextTick()
    expect(view.get('.board-empty p').text()).toContain('Your journey ends with 0 points.')
  })
  it('filters and sorts quests without losing their probability text', async () => {
    const game = useGameStore()
    game.gameId = 'game1'
    game.stats.lives = 3
    game.boardLoaded = true
    game.messages = [
      {
        adId: 'a',
        message: 'First request',
        probability: 'Gamble',
        reward: 99,
        expiresIn: 1,
      },
      {
        adId: 'b',
        message: 'Second request',
        probability: 'Sure thing',
        reward: 12,
        expiresIn: 4,
      },
    ]
    const view = mount(QuestBoard, { global })
    expect(view.text()).toContain('Gamble')
    expect(view.text()).toContain('1 turn')
    await view.findAll('.board-filters button')[0]!.trigger('click')
    expect(view.findAll('article')).toHaveLength(1)
    expect(view.text()).toContain('Second request')
    await view.findAll('.board-filters button')[0]!.trigger('click')
    await view.get('select').setValue('reward')
    expect(view.findAll('article')[0]!.text()).toContain('First request')
    await view.get('select').setValue('expiry')
    expect(view.findAll('article')[0]!.text()).toContain('First request')
    game.messages[1]!.probability = 'Unknown'
    await view.findAll('.board-filters button')[0]!.trigger('click')
    expect(view.find('.board-empty').exists()).toBe(true)
    expect(view.findAll('article')).toHaveLength(0)
  })
  it('combines independent filters using case-insensitive difficulty and description matches', async () => {
    const game = useGameStore()
    game.gameId = 'game1'
    game.stats.lives = 3
    game.boardLoaded = true
    const descriptions = [
      'HELP a farmer',
      'Rescue a traveler',
      'ESCORT a merchant',
      'Post an Advertisement',
      'INVESTIGATE a cave',
      'Infiltrate a castle',
      'Find a flock',
    ]
    const probabilities = [
      'Sure Thing',
      'Piece of cake',
      'Walk in the park',
      'Risky',
      'Sure thing',
      'Gamble',
      'Unknown',
    ]
    game.messages = descriptions.map((message, index) => ({
      adId: `quest-${index}`,
      message,
      probability: probabilities[index]!,
      reward: index,
      expiresIn: 7,
    }))
    const view = mount(QuestBoard, { global })
    const toggles = view.findAll('.board-filters button')
    const shown = () => view.findAll('.quest-content > p').map((row) => row.text())
    expect(toggles.map((toggle) => toggle.attributes('aria-pressed'))).toEqual([
      'false',
      'false',
      'false',
    ])
    expect(shown()).toEqual(descriptions)
    await toggles[1]!.trigger('click')
    expect(shown()).toEqual(descriptions.slice(0, 5))
    await toggles[0]!.trigger('click')
    expect(shown()).toEqual([descriptions[0], descriptions[1], descriptions[2], descriptions[4]])
    await toggles[2]!.trigger('click')
    expect(shown()).toEqual([descriptions[4]])
    await toggles[1]!.trigger('click')
    await toggles[0]!.trigger('click')
    expect(shown()).toEqual(descriptions.slice(4, 6))
    await toggles[2]!.trigger('click')
    expect(shown()).toEqual(descriptions)
  })
  it('keeps loaded rows mounted while refreshing and blocks stale quests after a failure', async () => {
    const game = useGameStore()
    game.gameId = 'game1'
    game.stats.lives = 3
    game.boardLoaded = true
    game.messages = [
      {
        adId: 'quest',
        message: 'Escort the merchant',
        probability: 'Sure thing',
        reward: 30,
        expiresIn: 4,
      },
    ]
    const view = mount(QuestBoard, { global })
    const row = view.get('article').element
    game.pending = 'messages'
    game.messagesLoading = true
    await view.vm.$nextTick()
    expect(view.get('article').element).toBe(row)
    expect(view.find('.quest-skeletons').exists()).toBe(false)
    expect(view.get('.solve-button').attributes('disabled')).toBeDefined()
    game.pending = ''
    game.messagesLoading = false
    game.boardLoaded = false
    await view.vm.$nextTick()
    expect(view.get('article').element).toBe(row)
    expect(view.text()).toContain('Showing the last loaded requests')
    expect(view.get('.solve-button').attributes('disabled')).toBeDefined()
    game.boardLoaded = true
    await view.vm.$nextTick()
    expect(view.get('.solve-button').attributes('disabled')).toBeUndefined()
  })
  it('disables shop purchases without enough gold and shows inventory quantities', async () => {
    const game = useGameStore()
    game.gameId = 'game1'
    game.stats.lives = 3
    game.stats.gold = 49
    game.shop = [{ id: 'hpot', name: 'Healing potion', cost: 50 }]
    game.shopLoaded = true
    const shop = mount(ShopModal, { global, props: { open: true } })
    expect(shop.get('button').attributes('disabled')).toBeDefined()
    game.stats.gold = 50
    await shop.vm.$nextTick()
    expect(shop.get('button').attributes('disabled')).toBeUndefined()
    const panel = mount(DragonPanel, { global })
    expect(panel.text()).toContain('Traveling light')
    game.purchases = [{ ...game.shop[0]!, quantity: 2 }]
    await panel.vm.$nextTick()
    expect(panel.text()).toContain('Healing potion')
    expect(panel.text()).toContain('×2')
    await panel.get('.inventory-section button').trigger('click')
    expect(panel.emitted('shop')).toHaveLength(1)
  })
  it('shows shop loading, errors, empty listings and purchase failures', async () => {
    const game = useGameStore()
    const view = mount(ShopModal, { global, props: { open: true } })
    expect(view.text()).toContain('could not be reached')
    game.pending = 'shop'
    await view.vm.$nextTick()
    expect(view.text()).toContain('Unpacking')
    game.pending = ''
    game.shopLoaded = true
    await view.vm.$nextTick()
    expect(view.findAll('.shop-items button')).toHaveLength(0)
    game.error = 'The realm is offline'
    game.history = [
      {
        id: 1,
        kind: 'purchase',
        success: false,
        title: 'Purchase unsuccessful',
        message: 'No luck',
        goldGained: 0,
        livesLost: 0,
        turn: 1,
      },
    ]
    game.activeOutcome = game.history[0]
    await view.vm.$nextTick()
    expect(view.text()).toContain('The realm is offline')
    expect(view.text()).toContain('Success: false')
    expect(view.text()).toContain('No luck')
  })
  it('shows congratulations with the level returned by the game', () => {
    const view = mount(LevelNotice, { global, props: { level: 3 } })
    expect(view.attributes('role')).toBe('status')
    expect(view.text()).toContain('Congratulations!')
    expect(view.text()).toContain('Your dragon reached level 3.')
  })
  it('validates the continue form, submits a trimmed game id, and closes only on success', async () => {
    const game = useGameStore()
    const resume = vi.spyOn(game, 'resume').mockResolvedValue(false)
    const view = mount(ContinueAdventureModal, { global, props: { open: true } })
    await view.get('form').trigger('submit')
    expect(view.get('[role="alert"]').text()).toContain('Enter a game ID')
    expect(resume).not.toHaveBeenCalled()
    await view.get('input').setValue('../unsafe')
    await view.get('form').trigger('submit')
    expect(resume).not.toHaveBeenCalled()
    game.error = 'Adventure not found'
    await view.get('input').setValue('  saved001  ')
    await view.get('form').trigger('submit')
    expect(resume).toHaveBeenCalledWith('saved001')
    expect(view.get('[role="alert"]').text()).toBe('Adventure not found')
    expect(view.emitted('update:open')).toBeUndefined()
    resume.mockResolvedValue(true)
    await view.get('form').trigger('submit')
    expect(view.emitted('update:open')).toEqual([[false]])
  })
  it('prefills the current id when opening the continue form and blocks duplicate submissions', async () => {
    const game = useGameStore()
    game.gameId = 'current-game'
    const resume = vi.spyOn(game, 'resume').mockResolvedValue(true)
    const view = mount(ContinueAdventureModal, { global, props: { open: false } })
    await view.setProps({ open: true })
    expect(view.get('input').element.value).toBe('current-game')
    game.pending = 'continue'
    await view.get('form').trigger('submit')
    expect(resume).not.toHaveBeenCalled()
    game.pending = ''
    await view.vm.$nextTick()
    await view
      .findAll('button')
      .find((button) => button.text() === 'Cancel')!
      .trigger('click')
    expect(view.emitted('update:open')).toEqual([[false]])
  })
  it('shows unknown resumed stats, session-only inventory and disables purchases until gold is reported', async () => {
    const game = useGameStore()
    game.gameId = 'saved'
    game.resumed = true
    game.unknownStats = ['lives', 'gold', 'score', 'turn', 'level']
    const stats = mount(PlayerStats, { global })
    expect(stats.get('[data-testid="stat-lives"]').text()).toBe('—')
    const panel = mount(DragonPanel, { global })
    expect(panel.text()).toContain('Level unknown')
    expect(panel.text()).toContain('Purchases this session')
    game.shop = [{ id: 'hpot', name: 'Healing potion', cost: 50 }]
    game.shopLoaded = true
    const shop = mount(ShopModal, { global, props: { open: true } })
    expect(shop.text()).toContain('Gold unknown')
    expect(shop.get('button').attributes('disabled')).toBeDefined()
    game.unknownStats = []
    game.stats.lives = 1
    game.stats.gold = 50
    await shop.vm.$nextTick()
    expect(shop.get('button').attributes('disabled')).toBeUndefined()
  })
  it.each([true, false])(
    'does not invent a quest delta when the previous stat is unknown: success=%s',
    (success) => {
      const view = mount(OutcomeNotice, {
        global,
        props: {
          outcome: {
            id: 1,
            kind: 'quest',
            success,
            title: 'Quest result',
            message: 'Done',
            goldGained: null,
            livesLost: null,
            turn: 8,
          },
        },
      })
      expect(view.text()).toContain(success ? 'Gold updated' : 'Lives updated')
      expect(view.text()).not.toContain('+0')
      expect(view.text()).not.toContain('-0')
    },
  )
  it.each([
    { livesLost: 1, change: '-1', label: 'life lost' },
    { livesLost: 3, change: '-3', label: 'lives lost' },
    { livesLost: 0, change: '0', label: 'lives lost' },
  ])('shows the actual life loss for failed quests: $livesLost', ({ livesLost, change, label }) => {
    const view = mount(OutcomeNotice, {
      global,
      props: {
        outcome: {
          id: 1,
          kind: 'quest',
          success: false,
          title: 'Quest unsuccessful',
          message: 'The mission failed.',
          goldGained: 0,
          livesLost,
          turn: 1,
        },
      },
    })
    expect(view.get('.outcome-change').text()).toBe(`${change} ${label}`)
    expect(view.text()).not.toContain('gold gained')
    expect(view.text()).not.toContain('-0')
  })
  it('does not display quest changes for failed purchases', () => {
    const view = mount(OutcomeNotice, {
      global,
      props: {
        outcome: {
          id: 1,
          kind: 'purchase',
          success: false,
          title: 'Purchase unsuccessful',
          message: 'Not enough gold.',
          goldGained: 0,
          livesLost: 0,
          turn: 1,
        },
      },
    })
    expect(view.find('.outcome-change').exists()).toBe(false)
  })
  it('confirms or cancels a risky quest at one life', async () => {
    const probability = 'Risky'

    const game = useGameStore()
    game.gameId = 'game1'
    game.stats.lives = 1
    game.boardLoaded = true
    game.messages = [
      {
        adId: 'risk',
        message: 'A dangerous request',
        probability,
        reward: 100,
        expiresIn: 4,
      },
    ]
    const solve = vi.spyOn(game, 'solve').mockResolvedValue()
    const view = mount(QuestBoard, { global })
    await view.get('.solve-button').trigger('click')
    expect(view.get('[role="dialog"]').text()).toContain('You are low on health')
    expect(view.get('[role="dialog"]').text()).toContain(probability)
    expect(solve).not.toHaveBeenCalled()
    await view
      .findAll('[role="dialog"] button')
      .find((entry) => entry.text() === 'Cancel')!
      .trigger('click')
    expect(solve).not.toHaveBeenCalled()
    expect(view.find('[role="dialog"]').exists()).toBe(false)
    await view.get('.solve-button').trigger('click')
    await view
      .findAll('[role="dialog"] button')
      .find((entry) => entry.text() === 'Attempt quest')!
      .trigger('click')
    expect(solve).toHaveBeenCalledExactlyOnceWith('risk')
    expect(view.find('[role="dialog"]').exists()).toBe(false)
  })
  it.each([
    { lives: 1, probability: 'Sure thing' },
    { lives: 1, probability: 'Unknown' },
    { lives: 2, probability: 'Risky' },
  ])('does not interrupt other quests: %s', async ({ lives, probability }) => {
    const game = useGameStore()
    game.gameId = 'game1'
    game.stats.lives = lives
    game.boardLoaded = true
    game.messages = [
      {
        adId: 'quest',
        message: 'A request',
        probability,
        reward: 10,
        expiresIn: 2,
      },
    ]
    const solve = vi.spyOn(game, 'solve').mockResolvedValue()
    const view = mount(QuestBoard, { global })
    await view.get('.solve-button').trigger('click')
    expect(view.find('[role="dialog"]').exists()).toBe(false)
    expect(solve).toHaveBeenCalledExactlyOnceWith('quest')
  })
  it('dismisses a stale warning when the turn or game changes', async () => {
    const game = useGameStore()
    game.gameId = 'game1'
    game.stats.lives = 1
    game.boardLoaded = true
    game.messages = [
      {
        adId: 'quest',
        message: 'Danger',
        probability: 'Risky',
        reward: 10,
        expiresIn: 2,
      },
    ]
    const solve = vi.spyOn(game, 'solve').mockResolvedValue()
    const view = mount(QuestBoard, { global })
    await view.get('.solve-button').trigger('click')
    game.stats.turn = 1
    await view.vm.$nextTick()
    expect(view.find('[role="dialog"]').exists()).toBe(false)
    expect(solve).not.toHaveBeenCalled()
    await view.get('.solve-button').trigger('click')
    game.gameId = 'game-2'
    await view.vm.$nextTick()
    expect(view.find('[role="dialog"]').exists()).toBe(false)
    expect(solve).not.toHaveBeenCalled()
  })
  it('displays last investigated reputation and provides a manual action', async () => {
    const game = useGameStore()
    game.gameId = 'fixture'
    game.stats.lives = 3
    const view = mount(ReputationStats, { global })
    expect(view.get('[data-testid="reputation-people"]').text()).toBe('—')
    game.reputationLoading = true
    await view.vm.$nextTick()
    expect(view.get('[role="status"]').text()).toContain('Updating reputation')
    game.reputationLoading = false
    game.reputation = { people: -0.25, state: 0, underworld: 0.0001 }
    game.reputationError = 'Showing last known values.'
    await view.vm.$nextTick()
    expect(view.get('[data-testid="reputation-people"]').text()).toBe('-0.25')
    expect(view.get('[data-testid="reputation-state"]').text()).toBe('0')
    expect(view.get('[data-testid="reputation-underworld"]').text()).toBe('0.0001')
    expect(view.get('[role="alert"]').text()).toContain('last known')
    const retry = vi.spyOn(game, 'refreshReputation').mockResolvedValue()
    await view.get('button').trigger('click')
    expect(retry).toHaveBeenCalledOnce()
    game.uncertain = true
    await view.vm.$nextTick()
    expect(view.get('button').attributes('disabled')).toBeDefined()
  })
  it.each([
    [1.0000000001, '1'],
    [1.42000005, '1.42'],
    [1.426, '1.43'],
    [-1.426, '-1.43'],
    [0, '0'],
    [-0.0001, '0'],
  ])(
    'rounds People %s for display while retaining its stored precision',
    async (people, displayed) => {
      const game = useGameStore()
      game.reputation = { people, state: 0.0001, underworld: -0.0001 }
      const view = mount(ReputationStats, { global })
      expect(view.get('[data-testid="reputation-people"]').text()).toBe(displayed)
      expect(view.get('[data-testid="reputation-state"]').text()).toBe('0.0001')
      expect(view.get('[data-testid="reputation-underworld"]').text()).toBe('-0.0001')
      expect(game.reputation.people).toBe(people)
      game.reputation.people = 2.10000001
      await view.vm.$nextTick()
      expect(view.get('[data-testid="reputation-people"]').text()).toBe('2.1')
    },
  )
})
