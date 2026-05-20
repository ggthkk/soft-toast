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

// ─── Computed ─────────────────────────────────────────────────────────────────

const getToastsByPosition = (position: ToastPosition) =>
  computed(() => toasts.value.filter((t) => t.position === position))

const allToasts = computed(() => toasts.value)

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Add a toast — or UPDATE an existing one if the same `id` is already visible.
 * This automatic deduplication means calling toast.error('Oops', { id: 'network-error' })
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
    // Play sound again if configured (content changed)
    const sound = options.sound
    const vol = options.soundVolume ?? 0.5
    if (sound) playToastSound(options.type ?? existing.type, sound, vol)
    return id
  }

  // ── New toast ──
  const toast: Toast = {
    ...defaultOptions,
    ...options,
    id,
    createdAt: Date.now(),
    remainingTime: options.duration ?? defaultOptions.duration,
    isPaused: false,
    isExpanded: true,
    isLeaving: false,
    preset: options.preset ?? defaultOptions.preset,
    bounce: options.bounce ?? defaultOptions.bounce,
    spring: options.spring ?? defaultOptions.spring,
    showTimestamp: options.showTimestamp ?? defaultOptions.showTimestamp,
    showProgress: options.showProgress ?? defaultOptions.showProgress,
  }

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
    toasts.value[index] = { ...toasts.value[index], ...options }
  }
}

const dismiss = (id?: string | { type?: ToastType | ToastType[] }) => {
  if (!id) {
    toasts.value.forEach((t) => { t.isLeaving = true })
    setTimeout(() => { toasts.value = [] }, 400)
    return
  }

  if (typeof id === 'string') {
    const toast = toasts.value.find((t) => t.id === id)
    if (toast) {
      toast.isLeaving = true
      toast.onDismiss?.(id)
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
      }
    })
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => !types.includes(t.type))
    }, 400)
  }
}

const pause = (id: string) => {
  const toast = toasts.value.find((t) => t.id === id)
  if (toast) toast.isPaused = true
}

const resume = (id: string) => {
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

    toasts.value.forEach((toast) => {
      if (!toast.isPaused && !toast.isLeaving && toast.remainingTime > 0 && toast.duration !== Infinity) {
        toast.remainingTime -= delta
        if (toast.remainingTime <= 0) {
          toast.isLeaving = true
          toast.onAutoClose?.(toast.id)
          setTimeout(() => {
            toasts.value = toasts.value.filter((t) => t.id !== toast.id)
          }, 400)
        }
      }
    })

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
  messages: ToastPromiseMessages,
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
      title: messages.success,
      description: messages.description?.success,
      duration: 4000,
    })
    return result
  } catch (err) {
    update(id, {
      type: 'error',
      title: messages.error,
      description: messages.description?.error,
      action: messages.action?.error,
      duration: 6000,
    })
    throw err
  }
}

const clearAll = () => { toasts.value = [] }

const remove = (id: string) => {
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
  promise: <T>(promiseFn: Promise<T>, messages: ToastPromiseMessages, options?: Omit<ToastOptions, 'type' | 'promise' | 'promiseMessages'>) => Promise<T>
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
