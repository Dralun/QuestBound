import { afterEach, vi } from 'vitest'

vi.stubGlobal(
  'fetch',
  vi.fn(() => {
    throw new Error('Unmocked network access is forbidden in tests.')
  }),
)
afterEach(() => {
  vi.clearAllMocks()
})
