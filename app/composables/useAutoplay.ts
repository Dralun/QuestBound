import { onScopeDispose, ref, shallowRef } from 'vue'
import type { AutoplayAction } from '../utils/autoplay'

export function useAutoplay(
  decide: () => AutoplayAction,
  perform: (
    action: Exclude<AutoplayAction, { kind: 'stop' }>,
    signal: AbortSignal,
  ) => Promise<void>,
) {
  const running = ref(false)
  const nextAction = shallowRef<AutoplayAction>()
  const status = ref('Choose Start autoplay to let your dragon play.')
  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let controller: AbortController | undefined

  function stop(message = 'Autoplay stopped.') {
    generation += 1
    controller?.abort()
    clearTimeout(timer)
    timer = undefined
    running.value = false
    nextAction.value = undefined
    status.value = message
  }

  function schedule(current: number, signal: AbortSignal) {
    const action = decide()
    if (action.kind === 'stop') return stop(action.description)
    nextAction.value = action
    status.value = action.description
    timer = setTimeout(async () => {
      if (!running.value || generation !== current) return
      try {
        await perform(action, signal)
      } catch {
        if (generation === current)
          stop('Autoplay stopped because the action could not be completed.')
        return
      }
      if (running.value && generation === current) schedule(current, signal)
    }, 0)
  }

  function start() {
    if (running.value) return
    running.value = true
    controller = new AbortController()
    schedule(++generation, controller.signal)
  }

  onScopeDispose(() => stop())
  return { running, nextAction, status, start, stop }
}
