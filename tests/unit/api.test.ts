import { describe, expect, it, vi } from 'vitest'
import { ApiError, createLiveTransport } from '../../app/services/api'
import { REQUEST_INTERVAL_MS } from '../../app/services/requestQueue'
import { TEST_API_URL } from '../fixtures/config'

describe('live transport with an injected mock fetch', () => {
  it('paces every endpoint through one queue without calling the network', async () => {
    vi.useFakeTimers()
    try {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{}'))
      const transport = createLiveTransport(TEST_API_URL, fetcher)
      const requests = [
        transport('/abc/solve/quest', 'POST'),
        transport('/abc/messages'),
        transport('/abc/shop'),
        transport('/abc/shop/buy/hpot', 'POST'),
      ]
      await vi.advanceTimersByTimeAsync(REQUEST_INTERVAL_MS - 1)
      expect(fetcher).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(fetcher).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(REQUEST_INTERVAL_MS * 2)
      expect(fetcher).toHaveBeenCalledTimes(4)
      await Promise.all(requests)
    } finally {
      vi.useRealTimers()
    }
  })
  it('uses documented methods and safe request options', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ gold: 0 })))
    expect(await createLiveTransport(TEST_API_URL, fetcher)('/game/start', 'POST')).toEqual({
      gold: 0,
    })
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/api/v2/game/start'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        headers: { Accept: 'application/json' },
      }),
    )
  })
  it('accepts array responses', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('[]'))
    expect(await createLiveTransport(TEST_API_URL, fetcher)('/abc/messages')).toEqual([])
  })
  it.each(['/../secret', '/abc/solve/../../x', '//evil.invalid', '/abc/investigate/private'])(
    'blocks unexpected paths',
    async (path) => {
      const fetcher = vi.fn<typeof fetch>()
      await expect(createLiveTransport(TEST_API_URL, fetcher)(path)).rejects.toThrow(
        'not available',
      )
      expect(fetcher).not.toHaveBeenCalled()
    },
  )
  it('supports reputation investigation using the documented POST method', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"people":0,"state":-0.1,"underworld":0.2}'))
    await expect(
      createLiveTransport(TEST_API_URL, fetcher)('/abc/investigate/reputation', 'POST'),
    ).resolves.toEqual({ people: 0, state: -0.1, underworld: 0.2 })
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/abc/investigate/reputation'),
      expect.objectContaining({ method: 'POST' }),
    )
  })
  it('describes uncertainty for POSTs and never retries them', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(
      createLiveTransport(TEST_API_URL, fetcher)('/abc/solve/x', 'POST'),
    ).rejects.toThrow('may have completed')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each([
    [400, true],
    [404, true],
    [408, false],
    [429, true],
    [500, false],
    [503, false],
  ])('distinguishes rejected requests from ambiguous failures: %s', async (status, rejected) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('private details', { status }))
    const cause = await createLiveTransport(TEST_API_URL, fetcher)('/abc/solve/x', 'POST').catch(
      (cause: unknown) => cause,
    )
    expect(cause).toBeInstanceOf(ApiError)
    expect(cause).toMatchObject({ status, rejected })
    expect((cause as Error).message).toContain(status === 429 ? 'busy' : String(status))
    expect((cause as Error).message).not.toContain('private details')
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('handles unavailable, invalid JSON, and primitive responses safely', async () => {
    for (const response of [new Response('invalid'), new Response('null'), new Response('12')]) {
      await expect(
        createLiveTransport(
          TEST_API_URL,
          vi.fn<typeof fetch>().mockResolvedValue(response),
        )('/abc/messages'),
      ).rejects.toThrow(/Cannot reach|unexpected response/)
    }
    await expect(
      createLiveTransport(
        TEST_API_URL,
        vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
      )('/abc/shop'),
    ).rejects.toThrow('Cannot reach')
  })
})
