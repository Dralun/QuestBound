import { expect, test, type Page } from '@playwright/test'
import { TEST_API_URL, TEST_BASE_URL } from '../fixtures/config'
import { decodedQuest, decodedRot13Quest, encodedQuest, rot13Quest } from '../fixtures/quests'

const initialStats = {
  gameId: 'fixture',
  lives: 3,
  gold: 0,
  score: 0,
  highScore: 0,
  turn: 0,
  level: 0,
}
const firstQuest = {
  adId: 'escort',
  message: 'Escort the alchemist to Highfirth.',
  probability: 'Sure thing',
  reward: 56,
  expiresIn: 7,
}
const secondQuest = {
  adId: 'sheep',
  message: 'Find the missing flock.',
  probability: 'Piece of cake',
  reward: 24,
  expiresIn: 5,
}
const shopItems = [{ id: 'hpot', name: 'Healing potion', cost: 50 }]
const initialReputation = { people: 0, state: 0, underworld: 0 }
const questReputation = { people: 0.25, state: -0.1, underworld: 0.0001 }

async function stubApi(page: Page, responses: Record<string, unknown[]>, missingStatus = 500) {
  const intercepted: string[] = []
  await page.route(`${TEST_API_URL}/**`, async (route) => {
    const key = `${route.request().method()} ${new URL(route.request().url()).pathname.replace('/api/v2', '')}`
    intercepted.push(key)
    const queue = responses[key]
    if (!queue?.length) return route.fulfill({ status: missingStatus, json: {} })
    return route.fulfill({ json: queue.shift() })
  })
  return intercepted
}

test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' || url.protocol === 'data:') return route.continue()
    return route.abort('blockedbyclient')
  })
})

test('adventure, shop, journal and reset work with intercepted API responses', async ({ page }) => {
  const errors: string[] = []
  const unexpectedRequests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    const url = request.url()
    if (new URL(url).hostname !== '127.0.0.1' && !url.startsWith(`${TEST_API_URL}/`)) {
      unexpectedRequests.push(url)
    }
  })
  const intercepted = await stubApi(page, {
    'POST /game/start': [initialStats, initialStats],

    'GET /fixture/messages': [
      [firstQuest, secondQuest],
      [secondQuest],
      [secondQuest],
      [firstQuest, secondQuest],
    ],
    'GET /fixture/shop': [shopItems, shopItems],
    'POST /fixture/solve/escort': [
      {
        success: true,
        lives: 3,
        gold: 56,
        score: 56,
        highScore: 0,
        turn: 1,
        message: 'You successfully solved the mission!',
      },
    ],
    'POST /fixture/shop/buy/hpot': [
      {
        shoppingSuccess: true,
        lives: 4,
        gold: 6,
        level: 0,
        turn: 2,
        message: 'Healing potion purchased.',
      },
    ],
  })
  await page.goto('./')
  await expect(page).toHaveTitle('Questbound')
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    'href',
    `${TEST_BASE_URL}favicon.svg`,
  )
  const favicon = await page.request.get(`${TEST_BASE_URL}favicon.svg`)
  expect(favicon.status()).toBe(200)
  expect(favicon.headers()['content-type']).toContain('image/svg+xml')
  await expect(page.getByRole('link', { name: 'Questbound home' })).toHaveText('QUESTBOUND')
  await expect(
    page.getByRole('link', { name: 'Questbound home' }).locator('svg.iconify'),
  ).toBeVisible()
  await expect(page.locator('html')).toHaveClass('dark')
  expect(
    await page
      .getByRole('link', { name: 'Questbound home' })
      .locator('svg.iconify')
      .evaluate((icon) => icon.getBoundingClientRect().width),
  ).toBeGreaterThanOrEqual(30)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Home is behind,')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('the world ahead')
  await expect(page.getByLabel('Game mode')).toHaveCount(0)
  expect(intercepted).toEqual([])
  await expect(page.getByRole('button', { name: 'Start autoplay', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Start adventure' }).click()
  await expect(page.getByTestId('stat-lives')).toHaveText('3')
  await expect(page.getByTestId('stat-gold')).toHaveText('0')
  await expect(
    page.getByRole('complementary').getByRole('region', { name: 'Reputation', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('complementary').getByRole('button', { name: 'Investigate reputation' }),
  ).toBeVisible()
  await expect(page.getByTestId('current-game-id')).toHaveText('fixture')
  await expect(page.getByRole('button', { name: 'Start autoplay', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Stop autoplay', exact: true })).toHaveCount(0)
  await expect(page.getByTestId('reputation-people')).toHaveText('—')
  await expect(page.getByRole('article')).toHaveCount(2)
  await page.getByRole('button', { name: /Visit the merchant/ }).click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByRole('heading', { name: 'The wandering merchant' })).toBeVisible()
  await expect(modal.locator('.item-icon svg.iconify')).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Buy Healing potion' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(modal).not.toBeVisible()
  await page.getByRole('button', { name: 'Solve quest 1', exact: true }).click()
  await expect(page.getByTestId('stat-gold')).toHaveText('56')
  await expect(page.getByTestId('stat-score')).toHaveText('56')
  await expect(page.getByTestId('stat-turn')).toHaveText('1')
  await expect(page.getByTestId('reputation-people')).toHaveText('—')
  await expect(page.getByTestId('reputation-state')).toHaveText('—')
  await expect(page.getByTestId('reputation-underworld')).toHaveText('—')
  await expect(page.getByRole('status').filter({ hasText: 'Quest accomplished' })).toContainText(
    '+56',
  )
  await page.getByRole('button', { name: /Visit the merchant/ }).click()
  await modal.getByRole('button', { name: 'Buy Healing potion' }).click()
  await expect(modal.getByRole('status')).toContainText('Success: true')
  await expect(modal).toContainText('Healing potion purchased.')
  await expect(modal.getByRole('button', { name: 'Buy Healing potion' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('stat-gold')).toHaveText('6')
  await expect(page.getByTestId('stat-lives')).toHaveText('4')
  await expect(page.getByTestId('stat-turn')).toHaveText('2')
  await expect(page.getByRole('complementary')).toContainText('Healing potion')
  await page.getByRole('button', { name: 'Journal' }).click()
  await expect(page.getByRole('dialog')).toContainText('Quest accomplished')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'New adventure' }).click()
  await page.getByRole('button', { name: 'Keep playing' }).click()
  await expect(page.getByTestId('stat-gold')).toHaveText('6')
  await page.getByRole('button', { name: 'New adventure' }).click()
  await page.getByRole('button', { name: 'Start new adventure' }).click()
  await expect(page.getByTestId('stat-gold')).toHaveText('0')
  await expect(page.getByRole('complementary')).toContainText('Traveling light')
  await expect(page.getByTestId('reputation-people')).toHaveText('—')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await expect(page.getByRole('button', { name: 'Refresh board' })).toBeEnabled()
  expect(intercepted).toEqual([
    'POST /game/start',
    'GET /fixture/messages',
    'GET /fixture/shop',
    'POST /fixture/solve/escort',
    'GET /fixture/messages',
    'GET /fixture/shop',
    'POST /fixture/shop/buy/hpot',
    'GET /fixture/messages',
    'POST /game/start',
    'GET /fixture/messages',
  ])
  expect(errors).toEqual([])
  expect(unexpectedRequests).toEqual([])
})

test('live-shaped responses are intercepted locally and synchronize every stat', async ({
  page,
}) => {
  let started = false
  let solved = false
  const intercepted: string[] = []
  await page.route(`${TEST_API_URL}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    intercepted.push(path)
    if (path.endsWith('/game/start')) {
      started = true
      return route.fulfill({
        json: { gameId: 'fixture', lives: 3, gold: 0, score: 0, highScore: 0, turn: 0, level: 0 },
      })
    }
    if (path.endsWith('/messages'))
      return route.fulfill({
        json: {
          messages: solved
            ? []
            : [
                {
                  adId: 'quest',
                  message: '<script>danger()</script> Save the village',
                  probability: 'Sure thing',
                  reward: '50',
                  expiresIn: 4,
                },
              ],
          gold: solved ? 50 : 0,
          turn: solved ? 1 : 0,
        },
      })
    if (path.endsWith('/solve/quest')) {
      solved = true
      return route.fulfill({
        json: {
          success: true,
          lives: 2,
          gold: 50,
          score: 50,
          highScore: 0,
          turn: 1,
          message: 'Success from fixture',
        },
      })
    }
    if (path.endsWith('/shop'))
      return route.fulfill({
        json: { items: [{ id: 'hpot', name: 'Healing potion', cost: 50 }], highScore: 88 },
      })
    if (path.endsWith('/investigate/reputation'))
      return route.fulfill({ json: solved ? questReputation : initialReputation })
    return route.fulfill({ status: 500, json: {} })
  })
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Start adventure' })).toBeVisible()
  expect(started).toBe(false)
  await page.getByRole('button', { name: 'Start adventure' }).click()
  await expect(page.getByRole('article')).toContainText('<script>danger()</script>')
  await page.getByRole('button', { name: 'Solve quest 1', exact: true }).click()
  await expect(page.getByTestId('stat-lives')).toHaveText('2')
  await expect(page.getByTestId('stat-highScore')).toHaveCount(0)
  await page.getByRole('button', { name: /Visit the merchant/ }).click()
  await expect(page.getByTestId('stat-highScore')).toHaveCount(0)
  await expect(page.getByTestId('stat-score')).toHaveText('50')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /Visit the merchant/ })).toBeFocused()
  expect(intercepted).toHaveLength(5)
})

test('losing the final life shows the result without querying the finished game', async ({
  page,
}) => {
  const intercepted = await stubApi(
    page,
    {
      'POST /game/start': [
        { ...initialStats, lives: 1 },
        { ...initialStats, gameId: 'next' },
      ],

      'GET /fixture/messages': [[firstQuest]],

      'GET /next/messages': [[firstQuest]],
      'POST /fixture/solve/escort': [
        {
          success: false,
          lives: 0,
          gold: 0,
          score: 0,
          highScore: 0,
          turn: 1,
          message: 'The mission failed.',
        },
      ],
    },
    410,
  )
  await page.goto('./')
  await expect(page.getByRole('link', { name: 'Skip to adventure' })).toBeAttached()
  await page.getByRole('link', { name: 'Skip to adventure' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  await page.getByRole('button', { name: 'Start adventure' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('article')).toHaveCount(1)
  const first = page.getByRole('button', { name: 'Solve quest 1', exact: true })
  await expect(first).toBeEnabled()
  await first.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('stat-turn')).toHaveText('1')
  await expect(page.getByTestId('stat-lives')).toHaveText('0')
  await expect(page.getByTestId('reputation-people')).toHaveText('—')
  await expect(page.locator('.board-empty')).toContainText('Your journey ends')
  await expect(page.getByRole('status').filter({ hasText: 'Quest unsuccessful' })).toContainText(
    'Success: false',
  )
  const result = page.getByRole('status').filter({ hasText: 'Quest unsuccessful' })
  await expect(result).toContainText('-1 life lost')
  await expect(result).not.toContainText('gold gained')
  await page.getByRole('button', { name: 'Journal' }).click()
  await expect(page.getByRole('dialog')).toContainText('-1 life lost')
  await expect(page.getByRole('dialog')).not.toContainText('gold gained')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /Visit the merchant/ })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Refresh board' })).toBeDisabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(intercepted).toEqual([
    'POST /game/start',
    'GET /fixture/messages',
    'POST /fixture/solve/escort',
  ])
  await page.getByRole('button', { name: 'New adventure', exact: true }).click()
  await expect(page.getByTestId('current-game-id')).toHaveText('next')
  await expect(page.getByTestId('stat-lives')).toHaveText('3')
  await expect(page.getByTestId('stat-turn')).toHaveText('0')
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(intercepted.filter((path) => path === 'POST /game/start')).toHaveLength(2)
})

test('low health requires confirmation before a risky quest', async ({ page }) => {
  const probability = 'Risky'

  const intercepted = await stubApi(page, {
    'POST /game/start': [{ ...initialStats, lives: 1 }],

    'GET /fixture/messages': [[{ ...firstQuest, probability }], []],
    'POST /fixture/solve/escort': [
      { success: true, lives: 1, gold: 56, score: 56, turn: 1, message: 'Mission completed.' },
    ],
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Start adventure' }).click()
  const solve = page.getByRole('button', { name: 'Solve quest 1', exact: true })
  const warning = page.getByRole('dialog')
  await solve.click()
  await expect(warning).toContainText('You are low on health')
  await expect(warning).toContainText(probability)
  expect(intercepted.filter((path) => path.includes('/solve/'))).toHaveLength(0)
  await warning.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(warning).not.toBeVisible()
  await expect(solve).toBeFocused()
  expect(intercepted.filter((path) => path.includes('/solve/'))).toHaveLength(0)
  await solve.click()
  await expect(warning).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(warning).not.toBeVisible()
  expect(intercepted.filter((path) => path.includes('/solve/'))).toHaveLength(0)
  await solve.click()
  await warning.getByRole('button', { name: 'Attempt quest' }).click()
  await expect(page.getByTestId('stat-turn')).toHaveText('1')
  await expect(page.getByTestId('reputation-people')).toHaveText('—')
  await expect(page.locator('.board-empty')).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(0)
  expect(intercepted.filter((path) => path.includes('/solve/'))).toHaveLength(1)
  expect(intercepted.filter((path) => path.endsWith('/investigate/reputation'))).toHaveLength(0)
})

test('reputation is investigated manually, costs a turn, refreshes quests and pauses on an unconfirmed request', async ({
  page,
}) => {
  const intercepted = await stubApi(page, {
    'POST /game/start': [initialStats],
    'GET /fixture/messages': [[firstQuest], [], []],
    'POST /fixture/solve/escort': [
      { success: true, lives: 3, gold: 56, score: 56, turn: 1, message: 'Mission completed.' },
    ],
  })
  let investigations = 0
  await page.route(`${TEST_API_URL}/fixture/investigate/reputation`, (route) => {
    investigations += 1
    if (investigations > 1) return route.fulfill({ status: 500, json: {} })
    return route.fulfill({ json: { ...questReputation, turn: 2 } })
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Start adventure', exact: true }).click()
  const region = page.getByRole('region', { name: 'Reputation' })
  await expect(page.getByTestId('reputation-people')).toHaveText('—')
  await page.getByRole('button', { name: 'Solve quest 1', exact: true }).click()
  await expect(page.getByTestId('stat-turn')).toHaveText('1')
  await expect(
    page.getByRole('button', { name: 'Investigate reputation', exact: true }),
  ).toBeEnabled()
  expect(investigations).toBe(0)
  await page.getByRole('button', { name: 'Investigate reputation', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('reputation-people')).toHaveText('0.25')
  await expect(page.getByTestId('reputation-state')).toHaveText('-0.1')
  await expect(page.getByTestId('stat-turn')).toHaveText('2')
  await expect(
    page.getByRole('button', { name: 'Investigate reputation', exact: true }),
  ).toBeEnabled()
  expect(intercepted.filter((path) => path.endsWith('/messages'))).toHaveLength(3)
  await page.getByRole('button', { name: 'Investigate reputation', exact: true }).click()
  await expect(region.getByRole('alert')).toContainText('Showing last known values')
  await expect(page.getByTestId('reputation-people')).toHaveText('0.25')
  await expect(page.getByTestId('stat-gold')).toHaveText('56')
  await expect(page.getByTestId('stat-turn')).toHaveText('2')
  await expect(
    page.getByRole('button', { name: 'Investigate reputation', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('alert').filter({ hasText: 'The action could not be confirmed.' }),
  ).toBeVisible()
  expect(investigations).toBe(2)
})

for (const { encoding, encoded, decoded } of [
  { encoding: 'base64', encoded: encodedQuest, decoded: decodedQuest },
  { encoding: 'ROT13', encoded: rot13Quest, decoded: decodedRot13Quest },
]) {
  test(`${encoding} quests display decoded text, warn on decoded probability and solve with the decoded id`, async ({
    page,
  }) => {
    const intercepted = await stubApi(page, {
      'POST /game/start': [{ ...initialStats, lives: 1 }],

      'GET /fixture/messages': [[encoded], []],
      [`POST /fixture/solve/${decoded.adId}`]: [
        {
          success: true,
          lives: 1,
          gold: decoded.reward,
          score: decoded.reward,
          turn: 1,
          message: 'Mission completed.',
        },
      ],
    })
    await page.goto('./')
    await page.getByRole('button', { name: 'Start adventure' }).click()
    const quest = page.getByRole('article')
    await expect(quest).toContainText(decoded.message)
    await expect(quest).toContainText(decoded.probability)
    await expect(quest).not.toContainText(encoded.message)
    await page.getByRole('button', { name: 'Solve quest 1', exact: true }).click()
    const warning = page.getByRole('dialog')
    await expect(warning).toContainText('You are low on health')
    await expect(warning).toContainText(decoded.message)
    await expect(warning).toContainText(decoded.probability)
    expect(intercepted.filter((path) => path.includes('/solve/'))).toHaveLength(0)
    await warning.getByRole('button', { name: 'Attempt quest' }).click()
    await expect(page.getByTestId('stat-gold')).toHaveText(String(decoded.reward))
    await expect(page.getByTestId('stat-turn')).toHaveText('1')
    await expect(page.getByTestId('reputation-people')).toHaveText('—')
    expect(intercepted.filter((path) => path.includes('/solve/'))).toEqual([
      `POST /fixture/solve/${decoded.adId}`,
    ])
  })
}

test('level-up and purchase messages expire without replaying when the shop reopens', async ({
  page,
}) => {
  await page.clock.install()
  await stubApi(page, {
    'POST /game/start': [{ ...initialStats, gold: 100 }],

    'GET /fixture/messages': [[firstQuest], [firstQuest]],
    'GET /fixture/shop': [shopItems, shopItems],
    'POST /fixture/shop/buy/hpot': [
      { shoppingSuccess: true, gold: 50, lives: 4, level: 2, turn: 1, message: 'A fine purchase.' },
    ],
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Start adventure' }).click()
  await page.getByRole('button', { name: /Visit the merchant/ }).click()
  const shop = page.getByRole('dialog')
  await shop.getByRole('button', { name: 'Buy Healing potion' }).click()
  await expect(shop.getByRole('status').filter({ hasText: 'Congratulations!' })).toContainText(
    'Your dragon reached level 2.',
  )
  await expect(shop.getByRole('status').filter({ hasText: 'Purchase successful' })).toContainText(
    'A fine purchase.',
  )
  await page.keyboard.press('Escape')
  await expect(shop).not.toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Congratulations!' })).toContainText(
    'level 2',
  )
  await page.clock.fastForward(5001)
  await expect(page.getByRole('status').filter({ hasText: 'Congratulations!' })).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Purchase successful' })).toHaveCount(0)
  await expect(page.getByRole('complementary')).toContainText('Level 2')
  await page.getByRole('button', { name: /Visit the merchant/ }).click()
  await expect(shop.getByRole('status')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Journal' }).click()
  await expect(page.getByRole('dialog')).toContainText('A fine purchase.')
  await page.clock.fastForward(6000)
  await expect(page.getByRole('dialog')).toContainText('A fine purchase.')
})

for (const success of [true, false]) {
  test(`quest messages expire and journal entries remain: success=${success}`, async ({ page }) => {
    await page.clock.install()
    await stubApi(page, {
      'POST /game/start': [initialStats],

      'GET /fixture/messages': [[firstQuest], []],
      'POST /fixture/solve/escort': [
        {
          success,
          lives: success ? 3 : 2,
          gold: success ? 56 : 0,
          turn: 1,
          message: 'A moment for the journal.',
        },
      ],
    })
    await page.goto('./')
    await page.getByRole('button', { name: 'Start adventure' }).click()
    await page.getByRole('button', { name: 'Solve quest 1', exact: true }).click()
    const result = page.getByRole('status').filter({ hasText: 'A moment for the journal.' })
    await expect(result).toBeVisible()
    await page.clock.fastForward(5001)
    await expect(result).toHaveCount(0)
    await page.getByRole('button', { name: 'Journal' }).click()
    await expect(page.getByRole('dialog')).toContainText('A moment for the journal.')
    await page.clock.fastForward(6000)
    await expect(page.getByRole('dialog')).toContainText('A moment for the journal.')
  })
}

test('continue adventure loads an existing id without starting a game and learns stats as you play', async ({
  page,
}) => {
  const intercepted = await stubApi(page, {
    'GET /saved001/messages': [[firstQuest], []],

    'GET /saved001/shop': [shopItems],
    'POST /saved001/solve/escort': [
      {
        success: true,
        lives: 1,
        gold: 145,
        score: 500,
        highScore: 0,
        turn: 9,
        level: 3,
        message: 'Adventure continued.',
      },
    ],
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Continue adventure', exact: true }).click()
  const dialog = page.getByRole('dialog')
  expect(intercepted).toEqual([])
  await dialog.getByLabel('Game ID', { exact: true }).fill('saved001')
  await dialog.getByLabel('Game ID', { exact: true }).press('Enter')
  await expect(dialog).not.toBeVisible()
  await expect(page.getByTestId('current-game-id')).toHaveText('saved001')
  await expect(page.getByTestId('stat-lives')).toHaveText('—')
  await expect(page.getByTestId('stat-gold')).toHaveText('—')
  await expect(page.getByTestId('stat-turn')).toHaveText('—')
  await expect(page.getByTestId('reputation-people')).toHaveText('—')
  await expect(page.getByRole('article')).toHaveCount(1)
  await page.getByRole('button', { name: /Visit the merchant/ }).click()
  await expect(dialog.getByRole('button', { name: 'Buy Healing potion' })).toBeDisabled()
  await expect(dialog).toContainText('Gold unknown')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Solve quest 1', exact: true }).click()
  await expect(page.getByTestId('stat-lives')).toHaveText('1')
  await expect(page.getByTestId('stat-gold')).toHaveText('145')
  await expect(page.getByTestId('stat-score')).toHaveText('500')
  await expect(page.getByTestId('stat-highScore')).toHaveCount(0)
  await expect(page.getByTestId('stat-turn')).toHaveText('9')
  await expect(page.getByRole('status').filter({ hasText: 'Adventure continued.' })).toContainText(
    'Gold updated',
  )
  await expect(page.getByRole('complementary')).toContainText('Level 3')
  await expect(page.getByRole('complementary')).toContainText('Purchases this session')
  expect(intercepted).not.toContain('POST /game/start')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('continue validates ids, preserves the current adventure on failure and allows retry', async ({
  page,
}) => {
  const intercepted = await stubApi(page, {
    'POST /game/start': [initialStats],

    'GET /fixture/messages': [[firstQuest]],
    'GET /restored/messages': [[]],
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Start adventure' }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
  const previousCalls = intercepted.length
  await page.getByRole('button', { name: 'Continue adventure', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Game ID', { exact: true })).toHaveValue('fixture')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue adventure', exact: true })).toBeFocused()
  expect(intercepted).toHaveLength(previousCalls)
  await page.getByRole('button', { name: 'Continue adventure', exact: true }).click()
  await dialog.getByLabel('Game ID', { exact: true }).fill('../unsafe')
  await dialog.getByRole('button', { name: 'Continue adventure', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Enter a game ID')
  expect(intercepted).toHaveLength(previousCalls)
  await dialog.getByLabel('Game ID', { exact: true }).fill('missing')
  await dialog.getByRole('button', { name: 'Continue adventure', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('500')
  await expect(page.getByTestId('current-game-id')).toHaveText('fixture')
  await dialog.getByLabel('Game ID', { exact: true }).fill('restored')
  await dialog.getByRole('button', { name: 'Continue adventure', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByTestId('current-game-id')).toHaveText('restored')
  await expect(page.locator('.board-empty')).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(0)
  expect(intercepted.filter((path) => path === 'POST /game/start')).toHaveLength(1)
})

test('continued adventures warn before risky quests with unknown health and do not invent life loss', async ({
  page,
}) => {
  const intercepted = await stubApi(
    page,
    {
      'GET /saved/messages': [[{ ...firstQuest, probability: 'Risky' }]],

      'POST /saved/solve/escort': [
        {
          success: false,
          lives: 0,
          gold: 20,
          score: 40,
          turn: 11,
          level: 1,
          message: 'The quest failed.',
        },
      ],
    },
    410,
  )
  await page.goto('./')
  await page.getByRole('button', { name: 'Continue adventure', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Game ID', { exact: true }).fill('saved')
  await dialog.getByRole('button', { name: 'Continue adventure', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: 'Solve quest 1', exact: true }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Your health is unknown')
  expect(intercepted.filter((path) => path.includes('/solve/'))).toHaveLength(0)
  await dialog.getByRole('button', { name: 'Attempt quest' }).click()
  await expect(page.getByTestId('stat-lives')).toHaveText('0')
  await expect(page.getByTestId('stat-turn')).toHaveText('11')
  await expect(page.getByTestId('stat-highScore')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Quest unsuccessful' })).toContainText(
    'Lives updated',
  )
  await expect(page.locator('.board-empty')).toContainText('Your journey ends')
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(intercepted).toEqual(['GET /saved/messages', 'POST /saved/solve/escort'])
})

test('quest updates keep the page, loaded rows, filters and scroll position in place', async ({
  page,
}) => {
  await page.clock.install()
  const documents: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'document') documents.push(request.url())
  })
  const board = Array.from({ length: 7 }, (_, index) => ({
    ...firstQuest,
    adId: `task-${index}`,
    message: `Escort merchant ${index + 1} through the forest and bring their wagon safely to Highfirth.`,
    expiresIn: 7 + index,
  }))
  let releaseMessages!: () => void
  const messagesGate = new Promise<void>((resolve) => {
    releaseMessages = resolve
  })
  let reputations = 0
  let boards = 0
  await page.route(`${TEST_API_URL}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/game/start')) return route.fulfill({ json: initialStats })
    if (path.endsWith('/investigate/reputation')) {
      reputations += 1
      return route.abort()
    }
    if (path.endsWith('/messages')) {
      boards += 1
      if (boards > 1) await messagesGate
      return route.fulfill({
        json:
          boards > 1 ? board.map((quest) => ({ ...quest, expiresIn: quest.expiresIn - 1 })) : board,
      })
    }
    if (path.endsWith('/solve/task-0'))
      return route.fulfill({
        json: {
          success: true,
          lives: 3,
          gold: 56,
          score: 56,
          turn: 1,
          message: 'The merchant arrived safely.',
        },
      })
    return route.abort()
  })
  try {
    await page.goto('./')
    await page.getByRole('button', { name: 'Start adventure' }).click()
    await expect(page.getByRole('article')).toHaveCount(7)
    await page.getByRole('button', { name: 'Safer bets' }).click()
    await page.getByRole('button', { name: 'Helping the people', exact: true }).focus()
    await page.keyboard.press('Space')
    await page.getByLabel('Search quests').fill('eScOrT')
    await page.getByLabel('Sort quests').selectOption('expiry')
    const region = page.getByRole('region', { name: 'The message board' })
    const originalBoard = await region.elementHandle()
    const originalRow = await page.getByRole('article').first().elementHandle()
    const originalGold = await page.getByTestId('stat-gold').elementHandle()
    const originalReputation = await page.getByTestId('reputation-people').elementHandle()
    const solve = page.getByRole('button', { name: 'Solve quest 1', exact: true })
    await solve.scrollIntoViewIfNeeded()
    const before = await page.evaluate(() => ({ scrollY, timeOrigin: performance.timeOrigin }))
    const boardTop = await region.evaluate(
      (element) => element.getBoundingClientRect().top + scrollY,
    )
    await solve.click()
    await expect(page.getByTestId('stat-gold')).toHaveText('56')
    expect(reputations).toBe(0)
    await expect(page.getByRole('article')).toHaveCount(7)
    await expect(region.locator('.quest-skeletons')).toHaveCount(0)
    expect(await originalRow!.evaluate((element) => element.isConnected)).toBe(true)
    await expect.poll(() => boards).toBe(2)
    await expect(page.getByTestId('reputation-people')).toHaveText('—')
    await expect(page.getByRole('article')).toHaveCount(7)
    await expect(region.locator('.quest-skeletons')).toHaveCount(0)
    await expect(solve).toBeDisabled()
    expect(await originalRow!.evaluate((element) => element.isConnected)).toBe(true)
    releaseMessages()
    await expect(page.getByRole('button', { name: 'Refresh board' })).toBeEnabled()
    await expect(page.getByRole('article').first()).toContainText('6 turns')
    await expect(page.getByLabel('Search quests')).toHaveValue('eScOrT')
    await expect(page.getByLabel('Sort quests')).toHaveValue('expiry')
    await expect(page.getByRole('button', { name: 'Safer bets' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(
      page.getByRole('button', { name: 'Helping the people', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    for (const element of [originalBoard, originalRow, originalGold, originalReputation])
      expect(await element!.evaluate((node) => node.isConnected)).toBe(true)
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(before.timeOrigin)
    expect(documents).toHaveLength(1)
    expect(
      Math.abs(
        (await region.evaluate((element) => element.getBoundingClientRect().top + scrollY)) -
          boardTop,
      ),
    ).toBeLessThanOrEqual(2)
    expect(Math.abs((await page.evaluate(() => scrollY)) - before.scrollY)).toBeLessThanOrEqual(2)
    await page.clock.fastForward(5001)
    expect(
      Math.abs(
        (await region.evaluate((element) => element.getBoundingClientRect().top + scrollY)) -
          boardTop,
      ),
    ).toBeLessThanOrEqual(2)
    await page.getByLabel('Search quests').fill('merchant 7')
    await expect(page.getByRole('article')).toHaveCount(1)
    await expect(page.getByRole('article')).toContainText('merchant 7')
    await page.getByLabel('Search quests').fill('missing request')
    await expect(page.locator('.board-empty')).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(0)
    await page.getByLabel('Search quests').clear()
    await expect(page.getByRole('article')).toHaveCount(7)
  } finally {
    releaseMessages()
  }
})

test('confirming a risky quest preserves the current scroll position', async ({ page }) => {
  const board = Array.from({ length: 7 }, (_, index) => ({
    ...firstQuest,
    adId: `task-${index}`,
    probability: 'Risky',
    message: `Escort merchant ${index + 1} through the forest and bring their wagon safely to Highfirth.`,
  }))
  await stubApi(page, {
    'POST /game/start': [{ ...initialStats, lives: 1 }],

    'GET /fixture/messages': [board, board],
    'POST /fixture/solve/task-6': [
      {
        success: true,
        lives: 1,
        gold: 56,
        score: 56,
        turn: 1,
        message: 'The merchant arrived safely.',
      },
    ],
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Start adventure' }).click()
  await expect(page.getByRole('article')).toHaveCount(7)
  const solve = page.getByRole('button', { name: 'Solve quest 7', exact: true })
  await solve.scrollIntoViewIfNeeded()
  const before = await page.evaluate(() => scrollY)
  await solve.click()
  const warning = page.getByRole('dialog')
  await expect(warning).toBeVisible()
  await warning.getByRole('button', { name: 'Attempt quest' }).click()
  await expect(warning).not.toBeVisible()
  await expect(page.getByTestId('stat-turn')).toHaveText('1')
  await expect(page.getByRole('button', { name: 'Refresh board' })).toBeEnabled()
  expect(Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThanOrEqual(2)
})

test('an explicit quest rejection releases the controls and allows manual retry without restarting the adventure', async ({
  page,
}) => {
  const intercepted: string[] = []
  let attempts = 0
  await page.route(`${TEST_API_URL}/**`, (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v2', '')
    intercepted.push(`${route.request().method()} ${path}`)
    if (path === '/game/start') return route.fulfill({ json: initialStats })
    if (path.endsWith('/messages')) return route.fulfill({ json: [firstQuest] })
    if (path.endsWith('/solve/escort')) {
      attempts += 1
      return attempts === 1
        ? route.fulfill({ status: 429, json: {} })
        : route.fulfill({
            json: { success: true, lives: 3, gold: 56, score: 56, turn: 1, level: 0 },
          })
    }
    return route.abort()
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Start adventure', exact: true }).click()
  await page.getByRole('button', { name: 'Solve quest 1', exact: true }).click()
  await expect(page.locator('.error-banner')).toContainText('The realm is busy')
  await expect(page.getByRole('button', { name: 'Start autoplay', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Refresh board' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Refresh and continue', exact: true })).toHaveCount(
    0,
  )
  await expect(page.getByTestId('stat-gold')).toHaveText('0')
  expect(attempts).toBe(1)
  await page.getByRole('button', { name: 'Refresh board' }).click()
  await page.getByRole('button', { name: 'Solve quest 1', exact: true }).click()
  await expect(page.getByTestId('stat-gold')).toHaveText('56')
  await expect(page.getByTestId('stat-turn')).toHaveText('1')
  await expect(page.locator('.error-banner')).toHaveCount(0)
  expect(attempts).toBe(2)
  expect(intercepted.filter((request) => request === 'POST /game/start')).toHaveLength(1)
})

for (const failure of ['server error', 'lost response']) {
  test(`an ambiguous ${failure} can recover the current adventure without replaying its quest`, async ({
    page,
  }) => {
    const intercepted: string[] = []
    let attempts = 0
    let boards = 0
    await page.route(`${TEST_API_URL}/**`, (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v2', '')
      intercepted.push(`${route.request().method()} ${path}`)
      if (path === '/game/start') return route.fulfill({ json: initialStats })
      if (path.endsWith('/messages')) {
        boards += 1
        return boards === 2
          ? route.fulfill({ status: 503, json: {} })
          : route.fulfill({ json: [firstQuest] })
      }
      if (path.endsWith('/solve/escort')) {
        attempts += 1
        if (attempts === 1)
          return failure === 'server error'
            ? route.fulfill({ status: 500, json: {} })
            : route.abort('failed')
        return route.fulfill({
          json: { success: true, lives: 2, gold: 151, score: 51, turn: 2, level: 1 },
        })
      }
      if (path.endsWith('/shop')) return route.fulfill({ json: shopItems })
      return route.abort()
    })
    await page.goto('./')
    await page.getByRole('button', { name: 'Start adventure', exact: true }).click()
    await page.getByRole('button', { name: 'Solve quest 1', exact: true }).click()
    await expect(page.locator('.error-banner')).toContainText('The last action may have completed.')
    await expect(page.getByRole('button', { name: 'Start autoplay', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Dismiss error', exact: true })).toHaveCount(0)
    const recovery = page.getByRole('button', { name: 'Refresh and continue', exact: true })
    await expect(recovery).toBeEnabled()
    await recovery.click()
    await expect(page.locator('.error-banner')).toContainText('503')
    await expect(recovery).toBeEnabled()
    await recovery.click()
    await expect(page.locator('.error-banner')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Start autoplay', exact: true })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Solve quest 1', exact: true })).toBeEnabled()
    await expect(page.getByTestId('current-game-id')).toHaveText('fixture')
    for (const stat of ['lives', 'gold', 'score', 'turn'])
      await expect(page.getByTestId(`stat-${stat}`)).toHaveText('\u2014')
    expect(attempts).toBe(1)
    await page.getByRole('button', { name: /Visit the merchant/ }).click()
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Buy Healing potion' }),
    ).toBeDisabled()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Solve quest 1', exact: true }).click()
    await expect(page.getByTestId('stat-gold')).toHaveText('151')
    await expect(page.getByTestId('stat-lives')).toHaveText('2')
    await expect(page.getByTestId('stat-turn')).toHaveText('2')
    await expect(page.getByRole('status').filter({ hasText: 'Quest accomplished' })).toContainText(
      'Gold updated',
    )
    expect(attempts).toBe(2)
    expect(intercepted.filter((request) => request === 'POST /game/start')).toHaveLength(1)
    await expect(page.getByRole('button', { name: 'Stop autoplay', exact: true })).toHaveCount(0)
  })
}
