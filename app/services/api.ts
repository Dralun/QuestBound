import type { Transport } from '../types/game'
import { record } from '../utils/validation'
import { createRequestQueue } from './requestQueue'
import { normalizeApiUrl } from '../utils/apiUrl'

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(
      status === 429
        ? 'The realm is busy. Wait a moment before trying again.'
        : `The realm could not complete this action (${status}).`,
    )
  }

  get rejected() {
    return this.status >= 400 && this.status < 500 && this.status !== 408
  }
}

export function createLiveTransport(
  baseUrl: string,
  fetcher: typeof fetch = globalThis.fetch,
): Transport {
  const enqueue = createRequestQueue()
  return async (path, method = 'GET', signal) => {
    const apiUrl = normalizeApiUrl(baseUrl)
    if (
      !/^\/(?:game\/start|[\w-]+\/(?:messages|shop(?:\/buy\/[\w-]+)?|solve\/[\w-]+|investigate\/reputation))$/.test(
        path,
      )
    ) {
      throw new Error('This game action is not available.')
    }
    return enqueue(async () => {
      try {
        const response = await fetcher(`${apiUrl}${path}`, {
          method,
          headers: { Accept: 'application/json' },
          credentials: 'omit',
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
        })
        if (!response.ok) throw new ApiError(response.status)
        const payload: unknown = await response.json()
        return Array.isArray(payload) ? payload : record(payload)
      } catch (error) {
        if (error instanceof ApiError) throw error
        throw new Error(
          method === 'POST'
            ? 'The action could not be confirmed. It may have completed. Use Refresh and continue to reload this adventure before trying another action.'
            : 'Cannot reach the realm. Check your connection and try refreshing the board.',
          { cause: error },
        )
      }
    }, signal)
  }
}
