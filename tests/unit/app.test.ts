import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import App from '../../app/app.vue'
import { useGameStore } from '../../app/stores/game'
import { uiStubs } from './uiStubs'

const panel = defineComponent({
  emits: ['shop'],
  template: '<button data-test="merchant" @click="$emit(\'shop\', $event)">Visit merchant</button>',
})
const global = {
  stubs: {
    ...uiStubs,
    PlayerStats: true,
    AutoplayControls: true,
    QuestBoard: true,
    DragonPanel: panel,
    OutcomeNotice: true,
    LevelNotice: true,
    ShopModal: true,
    ContinueAdventureModal: true,
  },
}

beforeEach(() => setActivePinia(createPinia()))

describe('adventure navigation', () => {
  it('starts a game only on a user action and confirms or cancels a new chapter', async () => {
    const game = useGameStore()
    const start = vi.spyOn(game, 'start').mockResolvedValue()
    const view = mount(App, { global })
    expect(start).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(view.find('select').exists()).toBe(false)
    const begin = view.findAll('button').find((entry) => entry.text().includes('Start adventure'))!
    await begin.trigger('click')
    expect(start).toHaveBeenCalledOnce()
    game.gameId = 'fixture'
    game.stats.lives = 3
    await view.vm.$nextTick()
    const newGame = view.findAll('button').find((entry) => entry.text().includes('New adventure'))!
    await newGame.trigger('click')
    expect(view.get('[role="dialog"]').attributes('aria-label')).toBe('Begin a new chapter?')
    await view
      .findAll('button')
      .find((entry) => entry.text() === 'Keep playing')!
      .trigger('click')
    expect(start).toHaveBeenCalledOnce()
    await newGame.trigger('click')
    await view
      .findAll('button')
      .find((entry) => entry.text() === 'Start new adventure')!
      .trigger('click')
    expect(start).toHaveBeenCalledTimes(2)
    game.stats.lives = 0
    await newGame.trigger('click')
    expect(view.find('[role="dialog"]').exists()).toBe(false)
    expect(start).toHaveBeenCalledTimes(3)
  })
  it('opens shop and journal, and displays and dismisses uncertain errors', async () => {
    const game = useGameStore()
    game.gameId = 'fixture'
    game.stats.lives = 3
    const openShop = vi.spyOn(game, 'openShop').mockResolvedValue()
    const view = mount(App, { global })
    await view.get('[data-test="merchant"]').trigger('click')
    await flushPromises()
    expect(openShop).toHaveBeenCalledOnce()
    await view
      .findAll('button')
      .find((entry) => entry.text().includes('Journal'))!
      .trigger('click')
    expect(view.text()).toContain('No tales to tell')
    game.history = [
      {
        id: 1,
        kind: 'quest',
        success: true,
        title: 'Success',
        message: 'Done',
        goldGained: 5,
        livesLost: 0,
        turn: 1,
      },
    ]
    game.error = 'No response'
    game.uncertain = true
    await view.vm.$nextTick()
    expect(view.text()).toContain('Stats will be unknown')
    expect(view.text()).toContain('TURN 1')
    expect(view.find('[aria-label="Dismiss error"]').exists()).toBe(false)
    const recover = vi.spyOn(game, 'recover').mockResolvedValue()
    await view
      .findAll('button')
      .find((entry) => entry.text() === 'Refresh and continue')!
      .trigger('click')
    expect(recover).toHaveBeenCalledOnce()
    game.error = ''
    await view.vm.$nextTick()
    expect(view.get('[role="alert"]').text()).toContain('Refresh and continue')
    game.error = 'Try again'
    game.uncertain = false
    await view.vm.$nextTick()
    expect(view.text()).toContain('A snag in the adventure.')
    await view.get('[aria-label="Dismiss error"]').trigger('click')
    expect(game.error).toBe('')
  })
})
