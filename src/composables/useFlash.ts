/**
 * @soft-toast/vue — Flash Message System
 *
 * Queues toasts that survive page navigation via sessionStorage.
 * Perfect for the "submit form → redirect → show success" pattern.
 *
 * Usage:
 *   // Before redirect:
 *   softToast.flash('Profile saved!', { type: 'success' })
 *   router.push('/dashboard')
 *
 *   // In the destination page (or App.vue):
 *   const { showPendingFlashes } = useFlash()
 *   onMounted(showPendingFlashes)
 *
 *   // Or let the plugin auto-show them (if autoFlash: true in plugin options)
 */

import type { ToastOptions } from "../types";
import { toastStore } from "../stores/toastStore";

const FLASH_STORAGE_KEY = "@soft-toast/vue:flash";

interface FlashItem {
  title: string;
  options: Partial<Omit<ToastOptions, "id">>;
  queuedAt: number;
}

// S2: validate that an arbitrary parsed value actually has the FlashItem shape.
// sessionStorage is shared with any other script on the same origin, so a
// malformed or tampered entry must not leak through as an arbitrary object
// (it could end up as a toast title of type non-string and crash render, or
// carry unexpected keys into toastStore.add). Reject anything that is not a
// plain object with a string title, an object options, and a number queuedAt.
const isFlashItem = (v: unknown): v is FlashItem => {
  if (typeof v !== "object" || v === null) return false;
  const item = v as Record<string, unknown>;
  if (typeof item.title !== "string") return false;
  if (typeof item.queuedAt !== "number") return false;
  if (
    item.options !== undefined &&
    (typeof item.options !== "object" || item.options === null)
  ) {
    return false;
  }
  return true;
};

// ─── Storage helpers ─────────────────────────────────────────────────────────

const readFlashes = (): FlashItem[] => {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(FLASH_STORAGE_KEY) || "[]",
    );
    // S2: only accept array values whose entries pass the shape check. A
    // non-array or malformed entry falls back to no flashes rather than
    // throwing into the calling code.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFlashItem);
  } catch {
    return [];
  }
};

const writeFlashes = (items: FlashItem[]) => {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(FLASH_STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* storage quota or unavailable */
  }
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Queue a flash toast to show on the NEXT page load / route change.
 * Flash items expire after 30 seconds to avoid stale messages.
 */
export const queueFlash = (
  title: string,
  options: Partial<Omit<ToastOptions, "id">> = {},
): void => {
  const existing = readFlashes().filter(
    (f) => Date.now() - f.queuedAt < 30_000, // discard stale flashes
  );
  existing.push({ title, options, queuedAt: Date.now() });
  writeFlashes(existing);
};

/**
 * Consume all pending flash messages and show them as toasts.
 * Call this in onMounted() of your layout or App.vue.
 * Returns the number of flashes shown.
 */
export const consumeFlashes = (): number => {
  const flashes = readFlashes().filter((f) => Date.now() - f.queuedAt < 30_000);
  // Clear storage immediately to avoid double-show
  writeFlashes([]);

  flashes.forEach((f) => {
    toastStore.add({ title: f.title, type: "default", ...f.options });
  });

  return flashes.length;
};

/**
 * Check if there are pending flashes without consuming them.
 */
export const hasPendingFlashes = (): boolean => {
  return readFlashes().some((f) => Date.now() - f.queuedAt < 30_000);
};

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
});
