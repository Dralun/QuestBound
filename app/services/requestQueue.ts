export const REQUEST_INTERVAL_MS = 10

export class RequestCancelledError extends Error {
  constructor() {
    super('The queued request was cancelled.')
  }
}

function wait(duration: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer)
      reject(new RequestCancelledError())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel)
      resolve()
    }, duration)
    signal?.addEventListener('abort', cancel, { once: true })
  })
}

export function createRequestQueue(intervalMs = REQUEST_INTERVAL_MS) {
  let tail = Promise.resolve()
  let lastCompleted: number | undefined

  return function enqueue<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const result = tail.then(async () => {
      if (signal?.aborted) throw new RequestCancelledError()
      if (lastCompleted !== undefined) {
        const remaining = intervalMs - (performance.now() - lastCompleted)
        if (remaining > 0) await wait(Math.ceil(remaining), signal)
      }
      if (signal?.aborted) throw new RequestCancelledError()
      try {
        return await work()
      } finally {
        lastCompleted = performance.now()
      }
    })
    tail = result.then(
      () => {},
      () => {},
    )
    return result
  }
}
