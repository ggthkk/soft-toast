/**
 * @soft-toast/vue — Flash Message System
 *
 * Queues toasts that survive page navigation via sessionStorage.
 * Perfect for the "submit form → redirect → show success" pattern.
 *
 * Usage:
 *   // Before redirect:
 *   toast.flash('Profile saved!', { type: 'success' })
 *   router.push('/dashboard')
 *
 *   // In the destination page (or App.vue):
 *   const { showPendingFlashes } = useFlash()
 *   onMounted(showPendingFlashes)
 *
 *   // Or let the plugin auto-show them (if autoFlash: true in plugin options)
 */

import type { ToastOptions } from '../types'
import { toastStore } from '../stores/toastStore'

const FLASH_STORAGE_KEY = '@soft-toast/vue:flash'

interface FlashItem {
  title: string
  options: Partial<Omit<ToastOptions, 'id'>>
  queuedAt: number
}

// ─── Storage helpers ─────────────────────────────────────────────────────────

const readFlashes = (): FlashItem[] => {
  if (typeof sessionStorage === 'undefined') return []
  try {
    return JSON.parse(sessionStorage.getItem(FLASH_STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

const writeFlashes = (items: FlashItem[]) => {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(FLASH_STORAGE_KEY, JSON.stringify(items))
  } catch {
    /* storage quota or unavailable */
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Queue a flash toast to show on the NEXT page load / route change.
 * Flash items expire after 30 seconds to avoid stale messages.
 */
export const queueFlash = (
  title: string,
  options: Partial<Omit<ToastOptions, 'id'>> = {}
): void => {
  const existing = readFlashes().filter(
    (f) => Date.now() - f.queuedAt < 30_000  // discard stale flashes
  )
  existing.push({ title, options, queuedAt: Date.now() })
  writeFlashes(existing)
}

/**
 * Consume all pending flash messages and show them as toasts.
 * Call this in onMounted() of your layout or App.vue.
 * Returns the number of flashes shown.
 */
export const consumeFlashes = (): number => {
  const flashes = readFlashes().filter(
    (f) => Date.now() - f.queuedAt < 30_000
  )
  // Clear storage immediately to avoid double-show
  writeFlashes([])

  flashes.forEach((f) => {
    toastStore.add({ title: f.title, type: 'default', ...f.options })
  })

  return flashes.length
}

/**
 * Check if there are pending flashes without consuming them.
 */
export const hasPendingFlashes = (): boolean => {
  return readFlashes().some((f) => Date.now() - f.queuedAt < 30_000)
}

// ─── Vue composable ──────────────────────────────────────────────────────────

/**
 * useFlash() — composable for components and route guards.
 *
 * @example
 * // In a page component:
 * const { flash } = useFlash()
 * const save = async () => {
 *   await api.save()
 *   flash('Changes saved!', { type: 'success' })
 *   router.push('/home')
 * }
 *
 * // In App.vue or layout:
 * const { showPendingFlashes } = useFlash()
 * onMounted(showPendingFlashes)
 */
export const useFlash = () => ({
  /** Queue a toast that will appear on the next page/route */
  flash: queueFlash,
  /** Show all pending flashes now — call in onMounted */
  showPendingFlashes: consumeFlashes,
  /** True if there are flashes waiting to be shown */
  hasPending: hasPendingFlashes,
})
