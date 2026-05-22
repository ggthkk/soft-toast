import { ref, computed } from 'vue'
import type { Toast, ToastOptions, ToastType, ToastPosition, ToastPromiseMessages } from '../types'
import { playToastSound } from '../utils/sound'

// ─── ID generation ───────────────────────────────────────────────────────────

const generateId = () => `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

// ─── Default options ─────────────────────────────────────────────────────────

const defaultOptions: Required<Pick<
  ToastOptions,
  'type' | 'duration' | 'position' | 'preset' | 'bounce' | 'spring' | 'showTimestamp' | 'showProgress'
>> = {
  type: 'default',
  duration: 4000,
  position: 'top-right',
  preset: 'smooth',
  bounce: 0.4,
  spring: true,
  showTimestamp: false,
  showProgress: false,
}

// ─── Reactive state ───────────────────────────────────────────────────────────

const toasts = ref<Toast[]>([])

// Non-reactive timer state — lives outside Vue reactivity to avoid per-frame re-renders
const timerMap = new Map<string, { remainingTime: number; isPaused: boolean }>()

const resetTimer = (id: string, duration: number, isPaused = false) => {
  if (duration === Infinity) {
    timerMap.delete(id)
    return
  }
  timerMap.set(id, { remainingTime: duration, isPaused })
}

// ─── Computed ─────────────────────────────────────────────────────────────────

const getToastsByPosition = (position: ToastPosition) =>
  computed(() => toasts.value.filter((t) => t.position === position))

const allToasts = computed(() => toasts.value)

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Add a toast — or UPDATE an existing one if the same `id` is already visible.
 * This automatic deduplication means calling softToast.error('Oops', { id: 'network-error' })
 * five times in a row results in ONE toast that refreshes its content each time.
 */
const add = (options: ToastOptions): string => {
  const id = options.id || generateId()

  // ── Smart Dedup: same id already exists → update instead of creating ──
  const existingIndex = toasts.value.findIndex((t) => t.id === id)
  if (existingIndex !== -1 && !toasts.value[existingIndex].isLeaving) {
    const existing = toasts.value[existingIndex]
    // Patch the existing toast with new content
    toasts.value[existingIndex] = {
      ...existing,
      ...options,
      id,
      // Reset timer so user has time to read the updated content
      remainingTime: options.duration ?? existing.duration,
      isPaused: existing.isPaused,
      isLeaving: false,
    }
    resetTimer(id, options.duration ?? existing.duration, existing.isPaused)
    // Play sound again if configured (content changed)
    const sound = options.sound
    const vol = options.soundVolume ?? 0.5
    if (sound) playToastSound(options.type ?? existing.type, sound, vol)
    return id
  }

  // ── New toast ──
  const duration = options.duration ?? defaultOptions.duration
  const toast: Toast = {
    ...defaultOptions,
    ...options,
    id,
    createdAt: Date.now(),
    remainingTime: duration,
    isPaused: false,
    isExpanded: true,
    isLeaving: false,
    preset: options.preset ?? defaultOptions.preset,
    bounce: options.bounce ?? defaultOptions.bounce,
    spring: options.spring ?? defaultOptions.spring,
    showTimestamp: options.showTimestamp ?? defaultOptions.showTimestamp,
    showProgress: options.showProgress ?? defaultOptions.showProgress,
  }

  // Register in non-reactive timer map
  resetTimer(id, duration, false)

  toasts.value.unshift(toast)
  startTickLoop()

  // Play sound if configured
  const sound = options.sound
  const vol = options.soundVolume ?? 0.5
  if (sound) playToastSound(toast.type, sound, vol)

  return id
}

const update = (id: string, options: Partial<ToastOptions>) => {
  const index = toasts.value.findIndex((t) => t.id === id)
  if (index !== -1) {
    const existing = toasts.value[index]
    const nextDuration = options.duration ?? existing.duration
    const nextRemainingTime =
      options.duration === undefined ? existing.remainingTime : nextDuration
    toasts.value[index] = {
      ...existing,
      ...options,
      remainingTime: nextRemainingTime,
    }
    if (options.duration !== undefined) {
      resetTimer(id, nextDuration, existing.isPaused)
    }
  }
}

const dismiss = (id?: string | { type?: ToastType | ToastType[] }) => {
  if (!id) {
    toasts.value.forEach((t) => { t.isLeaving = true })
    timerMap.clear()
    setTimeout(() => { toasts.value = [] }, 400)
    return
  }

  if (typeof id === 'string') {
    const toast = toasts.value.find((t) => t.id === id)
    if (toast) {
      toast.isLeaving = true
      toast.onDismiss?.(id)
      timerMap.delete(id)
      setTimeout(() => {
        toasts.value = toasts.value.filter((t) => t.id !== id)
      }, 400)
    }
  } else {
    const types = Array.isArray(id.type) ? id.type : [id.type]
    toasts.value.forEach((t) => {
      if (types.includes(t.type)) {
        t.isLeaving = true
        t.onDismiss?.(t.id)
        timerMap.delete(t.id)
      }
    })
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => !types.includes(t.type))
    }, 400)
  }
}

const pause = (id: string) => {
  const timer = timerMap.get(id)
  if (timer) timer.isPaused = true
  const toast = toasts.value.find((t) => t.id === id)
  if (toast) toast.isPaused = true
}

const resume = (id: string) => {
  const timer = timerMap.get(id)
  if (timer) timer.isPaused = false
  const toast = toasts.value.find((t) => t.id === id)
  if (toast) toast.isPaused = false
}

const expand = (id: string) => {
  const toast = toasts.value.find((t) => t.id === id)
  if (toast) toast.isExpanded = true
}

const collapse = (id: string) => {
  const toast = toasts.value.find((t) => t.id === id)
  if (toast) toast.isExpanded = false
}

// ─── Global RAF tick loop ─────────────────────────────────────────────────────

let lastTime = 0
let rafId: number | null = null

const startTickLoop = () => {
  if (rafId !== null) return
  if (typeof window === 'undefined') return

  const loop = (currentTime: number) => {
    if (lastTime === 0) lastTime = currentTime
    const delta = currentTime - lastTime
    lastTime = currentTime

    // Tick non-reactive timer map — zero Vue reactivity cost per frame
    const expiredIds: string[] = []
    timerMap.forEach((timer, id) => {
      if (timer.isPaused) return
      const toast = toasts.value.find((t) => t.id === id)
      if (!toast || toast.isLeaving || toast.duration === Infinity) return
      timer.remainingTime -= delta
      // Sync remainingTime back to toast only for progress bar consumers
      if (toast.showProgress) toast.remainingTime = timer.remainingTime
      if (timer.remainingTime <= 0) expiredIds.push(id)
    })

    // Mutate Vue state only when a toast actually expires
    for (const id of expiredIds) {
      timerMap.delete(id)
      const toast = toasts.value.find((t) => t.id === id)
      if (toast && !toast.isLeaving) {
        toast.isLeaving = true
        toast.onAutoClose?.(id)
        setTimeout(() => {
          toasts.value = toasts.value.filter((t) => t.id !== id)
        }, 400)
      }
    }

    if (toasts.value.length > 0) {
      rafId = requestAnimationFrame(loop)
    } else {
      rafId = null
      lastTime = 0
    }
  }

  rafId = requestAnimationFrame(loop)
}

// ─── Type helpers ─────────────────────────────────────────────────────────────

const success = (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) =>
  add({ ...options, type: 'success', title })

const error = (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) =>
  add({ ...options, type: 'error', title })

const warning = (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) =>
  add({ ...options, type: 'warning', title })

const info = (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) =>
  add({ ...options, type: 'info', title })

const loading = (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) =>
  add({ ...options, type: 'promise', title, duration: Infinity })

const promise = async <T>(
  promiseFn: Promise<T>,
  messages: ToastPromiseMessages<T>,
  options?: Omit<ToastOptions, 'type' | 'promise' | 'promiseMessages'>
): Promise<T> => {
  const id = add({
    ...options,
    type: 'promise',
    title: messages.loading,
    duration: Infinity,
  })

  try {
    const result = await promiseFn
    update(id, {
      type: 'success',
      title: typeof messages.success === 'function' ? messages.success(result) : messages.success,
      description: typeof messages.description?.success === 'function' ? messages.description.success(result) : messages.description?.success,
      duration: 4000,
    })
    return result
  } catch (err) {
    update(id, {
      type: 'error',
      title: typeof messages.error === 'function' ? messages.error(err) : messages.error,
      description: typeof messages.description?.error === 'function' ? messages.description.error(err) : messages.description?.error,
      action: messages.action?.error,
      duration: 6000,
    })
    throw err
  }
}

const clearAll = () => {
  timerMap.clear()
  toasts.value = []
}

const remove = (id: string) => {
  timerMap.delete(id)
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

// ─── Store interface + export ─────────────────────────────────────────────────

import type { ComputedRef } from 'vue'

export interface ToastStore {
  toasts: ComputedRef<Toast[]>
  getToastsByPosition: (position: ToastPosition) => ComputedRef<Toast[]>
  add: (options: ToastOptions) => string
  update: (id: string, options: Partial<ToastOptions>) => void
  dismiss: (id?: string | { type?: ToastType | ToastType[] }) => void
  pause: (id: string) => void
  resume: (id: string) => void
  expand: (id: string) => void
  collapse: (id: string) => void
  success: (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) => string
  error: (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) => string
  warning: (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) => string
  info: (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) => string
  loading: (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) => string
  promise: <T>(promiseFn: Promise<T>, messages: ToastPromiseMessages<T>, options?: Omit<ToastOptions, 'type' | 'promise' | 'promiseMessages'>) => Promise<T>
  clearAll: () => void
  remove: (id: string) => void
}

export const toastStore: ToastStore = {
  toasts: allToasts,
  getToastsByPosition,
  add,
  update,
  dismiss,
  pause,
  resume,
  expand,
  collapse,
  success,
  error,
  warning,
  info,
  loading,
  promise,
  clearAll,
  remove,
}
