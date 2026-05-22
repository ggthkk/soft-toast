import type { ToastOptions, ToastPromiseMessages } from '../types'
import { toastStore } from '../stores/toastStore'
import { queueFlash, consumeFlashes, hasPendingFlashes } from './useFlash'

// ─── Composable API ───────────────────────────────────────────────────────────

export const useToast = () => ({
  default: (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) =>
    toastStore.add({ ...options, type: 'default', title }),

  success: (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) =>
    toastStore.add({ ...options, type: 'success', title }),

  error: (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) =>
    toastStore.add({ ...options, type: 'error', title }),

  warning: (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) =>
    toastStore.add({ ...options, type: 'warning', title }),

  info: (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) =>
    toastStore.add({ ...options, type: 'info', title }),

  loading: (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) =>
    toastStore.loading(title, options),

  promise: <T>(
    promiseFn: Promise<T>,
    messages: ToastPromiseMessages<T>,
    options?: Omit<ToastOptions, 'type' | 'promise' | 'promiseMessages'>
  ): Promise<T> => toastStore.promise(promiseFn, messages, options),

  custom: (options: ToastOptions) => toastStore.add(options),

  update: (id: string, options: Partial<ToastOptions>) => toastStore.update(id, options),

  dismiss: (id?: string) => toastStore.dismiss(id),
  dismissAll: () => toastStore.dismiss(),

  pause: (id: string) => toastStore.pause(id),
  resume: (id: string) => toastStore.resume(id),

  /**
   * Queue a toast that will be shown on the next page load / route navigation.
   * Perfect for the "submit → redirect → show success" pattern.
   *
   * @example
   * const { flash } = useToast()
   * await api.save()
   * flash('Saved!', { type: 'success' })
   * router.push('/dashboard')
   */
  flash: (title: string, options: Partial<Omit<ToastOptions, 'id'>> = {}) =>
    queueFlash(title, options),

  /**
   * Show any toasts that were queued with flash() before a page navigation.
   * Call this in onMounted() of your root layout or App.vue.
   */
  showFlashes: () => consumeFlashes(),

  /** Check if there are pending flash messages without consuming them. */
  hasFlashes: () => hasPendingFlashes(),
})

// ─── Singleton API (usable outside components) ────────────────────────────────

export const toast = {
  default: (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) =>
    toastStore.add({ ...options, type: 'default', title }),
  success: (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) =>
    toastStore.add({ ...options, type: 'success', title }),
  error: (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) =>
    toastStore.add({ ...options, type: 'error', title }),
  warning: (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) =>
    toastStore.add({ ...options, type: 'warning', title }),
  info: (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) =>
    toastStore.add({ ...options, type: 'info', title }),
  loading: (title: string, options?: Omit<ToastOptions, 'type' | 'title'>) =>
    toastStore.loading(title, options),
  promise: <T>(
    promiseFn: Promise<T>,
    messages: ToastPromiseMessages<T>,
    options?: Omit<ToastOptions, 'type' | 'promise' | 'promiseMessages'>
  ): Promise<T> => toastStore.promise(promiseFn, messages, options),
  custom: (options: ToastOptions) => toastStore.add(options),
  update: (id: string, options: Partial<ToastOptions>) => toastStore.update(id, options),
  dismiss: (id?: string) => toastStore.dismiss(id),
  dismissAll: () => toastStore.dismiss(),
  pause: (id: string) => toastStore.pause(id),
  resume: (id: string) => toastStore.resume(id),
  flash: (title: string, options: Partial<Omit<ToastOptions, 'id'>> = {}) =>
    queueFlash(title, options),
  showFlashes: () => consumeFlashes(),
  hasFlashes: () => hasPendingFlashes(),
}
