import { describe, expect, it, vi } from 'vitest'
import { normalizeApiUrl } from '../../app/utils/apiUrl'
import { createLiveTransport } from '../../app/services/api'
import { TEST_API_URL } from '../fixtures/config'

describe('API URL configuration', () => {
  it.each([
    [TEST_API_URL, TEST_API_URL],
    [`  ${TEST_API_URL}///  `, TEST_API_URL],
    ['https://api.example.invalid/', 'https://api.example.invalid'],
    ['http://api.example.invalid/api', 'http://api.example.invalid/api'],
    ['http://localhost:8080/api/', 'http://localhost:8080/api'],
    ['http://127.0.0.1:8080/api', 'http://127.0.0.1:8080/api'],
    ['http://[::1]:8080/api', 'http://[::1]:8080/api'],
  ])('accepts and normalizes %s', (value, expected) => {
    expect(normalizeApiUrl(value)).toBe(expected)
  })

  it.each([
    undefined,
    '',
    '   ',
    '/api/v2',
    '//api.example.invalid/api',
    'not a URL',
    'javascript:alert(1)',
  ])('rejects missing or invalid URLs: %s', (value) => {
    expect(() => normalizeApiUrl(value)).toThrow('Set VITE_GAME_API_URL')
  })

  it('rejects a missing URL before attempting any network request', async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(createLiveTransport('', fetcher)('/game/start', 'POST')).rejects.toThrow(
      'Set VITE_GAME_API_URL',
    )
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('sends requests to the configured origin and normalizes a trailing slash', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'))
    await createLiveTransport(`${TEST_API_URL}/`, fetcher)('/game/start', 'POST')
    expect(fetcher).toHaveBeenCalledWith(`${TEST_API_URL}/game/start`, expect.any(Object))
  })
})
