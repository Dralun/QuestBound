import { onScopeDispose, shallowRef } from 'vue'

export function useTimedNotice<T>(duration = 5000) {
  const notice = shallowRef<T>()
  let timeout: ReturnType<typeof setTimeout> | undefined

  function clear() {
    clearTimeout(timeout)
    timeout = undefined
    notice.value = undefined
  }

  function show(value: T) {
    clear()
    notice.value = value
    timeout = setTimeout(clear, duration)
  }

  onScopeDispose(clear)
  return { notice, show, clear }
}
