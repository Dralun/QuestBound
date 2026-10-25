import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequestQueue, RequestCancelledError } from '../../app/services/requestQueue'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('request spacing with inert callbacks', () => {
  it('serializes every request with 250 milliseconds between completion and the next dispatch', async () => {
    const enqueue = createRequestQueue(250)
    const work = vi.fn(async () => performance.now())
    const first = enqueue(work)
    const second = enqueue(work)
    const third = enqueue(work)
    await vi.advanceTimersByTimeAsync(0)
    expect(work).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(249)
    expect(work).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(work).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(250)
    expect(await Promise.all([first, second, third])).toEqual([0, 250, 500])
  })
  it('waits until the previous response finishes before starting its 250-millisecond interval', async () => {
    const enqueue = createRequestQueue(250)
    let complete!: () => void
    const first = enqueue(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve
        }),
    )
    const work = vi.fn(async () => 'next')
    const second = enqueue(work)
    await vi.advanceTimersByTimeAsync(5000)
    expect(work).not.toHaveBeenCalled()
    complete()
    await first
    await vi.advanceTimersByTimeAsync(249)
    expect(work).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(await second).toBe('next')
  })
  it('spaces requests after errors and never retries a failed request', async () => {
    const enqueue = createRequestQueue(250)
    const failed = vi.fn(async () => {
      throw new Error('fake failure')
    })
    const first = enqueue(failed).catch((cause: unknown) => cause)
    const next = vi.fn(async () => 'ok')
    const second = enqueue(next)
    await vi.advanceTimersByTimeAsync(249)
    expect(await first).toBeInstanceOf(Error)
    expect(next).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(await second).toBe('ok')
    expect(failed).toHaveBeenCalledOnce()
  })
  it('cancels a waiting request without sending it or consuming another interval', async () => {
    const enqueue = createRequestQueue(250)
    await enqueue(async () => 'first')
    const controller = new AbortController()
    const work = vi.fn(async () => 'cancelled')
    const cancelled = enqueue(work, controller.signal).catch((cause: unknown) => cause)
    await vi.advanceTimersByTimeAsync(125)
    controller.abort()
    expect(await cancelled).toBeInstanceOf(RequestCancelledError)
    expect(work).not.toHaveBeenCalled()
    const next = vi.fn(async () => 'next')
    const result = enqueue(next)
    await vi.advanceTimersByTimeAsync(124)
    expect(next).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(await result).toBe('next')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('rejects already-cancelled queued requests without executing them', async () => {
    const enqueue = createRequestQueue(250)
    const controller = new AbortController()
    controller.abort()
    const work = vi.fn(async () => 'unused')
    await expect(enqueue(work, controller.signal)).rejects.toBeInstanceOf(RequestCancelledError)
    expect(work).not.toHaveBeenCalled()
  })
  it('lets an already-sent request finish when autoplay is stopped', async () => {
    const enqueue = createRequestQueue(250)
    const controller = new AbortController()
    let complete!: (value: string) => void
    const result = enqueue(
      () =>
        new Promise<string>((resolve) => {
          complete = resolve
        }),
      controller.signal,
    )
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    complete('confirmed response')
    expect(await result).toBe('confirmed response')
  })
  it('dispatches immediately after the minimum interval has already elapsed', async () => {
    const enqueue = createRequestQueue(250)
    await enqueue(async () => 'first')
    await vi.advanceTimersByTimeAsync(375)
    expect(await enqueue(async () => performance.now())).toBe(375)
    expect(vi.getTimerCount()).toBe(0)
  })
})
