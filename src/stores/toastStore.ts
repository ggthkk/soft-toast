import { ref, computed, type ComputedRef } from "vue";
import type {
  Toast,
  ToastOptions,
  ToastType,
  ToastPosition,
  ToastPromiseMessages,
  QueueOverflow,
} from "../types";
import { playToastSound } from "../utils/sound";

// ─── Timing constants ────────────────────────────────────────────────────────
// Fallback delay before a toast is removed from the array after it starts
// leaving. exitAnimation (~290ms) + buffer; swipe exit (~280ms) + buffer.
// ToastItem.vue imports this so the dismiss + swipe paths share one source.
export const EXIT_REMOVE_DELAY_MS = 400;

// ─── ID generation ───────────────────────────────────────────────────────────

const generateId = () =>
  `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// ─── Default options ─────────────────────────────────────────────────────────

const defaultOptions: Required<
  Pick<
    ToastOptions,
    | "type"
    | "duration"
    | "position"
    | "preset"
    | "bounce"
    | "spring"
    | "showTimestamp"
    | "showProgress"
  >
> = {
  type: "default",
  duration: 4000,
  position: "top-right",
  preset: "smooth",
  bounce: 0.4,
  spring: true,
  showTimestamp: false,
  showProgress: false,
};

// ─── Reactive state ───────────────────────────────────────────────────────────

const toasts = ref<Toast[]>([]);

// Non-reactive timer state — lives outside Vue reactivity to avoid per-frame
// re-renders. Each entry holds a direct reference to its Toast so the RAF tick
// loop can read toast fields (isLeaving, showProgress, ...) in O(1) instead of
// doing an O(n) array scan per timer per frame.
const timerMap = new Map<
  string,
  { toast: Toast; remainingTime: number; isPaused: boolean }
>();

// id → Toast reference index. Kept in sync with toasts.value so pause/resume/
// expand/collapse/dismiss-by-id can find a toast in O(1) instead of scanning
// the array (was O(n) per call → O(n²) when the visibility handler pauses
// every toast on tab-hide). Note: the index holds the CURRENT toast object —
// callers that replace a toast in place (add/dedup, update) must refresh it.
const toastIndex = new Map<string, Toast>();

// Remove exactly one toast generation. Public IDs are reusable, so delayed
// cleanup must not resolve an ID again after a newer toast may have claimed it.
const removeToastInstance = (toast: Toast) => {
  const timer = timerMap.get(toast.id);
  if (timer?.toast === toast) timerMap.delete(toast.id);

  if (toastIndex.get(toast.id) === toast) toastIndex.delete(toast.id);

  const index = toasts.value.indexOf(toast);
  if (index !== -1) toasts.value.splice(index, 1);
};

const resetTimer = (
  id: string,
  toast: Toast,
  duration: number,
  isPaused = false,
) => {
  if (duration === Infinity) {
    timerMap.delete(id);
    return;
  }
  timerMap.set(id, { toast, remainingTime: duration, isPaused });
};

// ─── Queue cap (maxQueue / queueOverflow) ─────────────────────────────────────
// Module-level config so the singleton store + plugin options stay in sync.
// Counting excludes isLeaving toasts so a leaving toast never blocks a new one
// during the ~400ms exit animation window.

const queueCap = { max: Infinity, overflow: "drop-oldest" as QueueOverflow };

const enforceCap = () => {
  const max = queueCap.max;
  if (!Number.isFinite(max) || max <= 0) return;

  // Capped toasts = active (non-leaving) AND NOT protected.
  // Loading/promise toasts use duration = Infinity and are PROTECTED from
  // the cap entirely — they do NOT count toward maxQueue and can NEVER be
  // dropped here. Reason: they are transient (a promise will resolve/reject
  // and the same toast object flips back to a normal finite duration), and
  // dropping one would make the subsequent update() call a no-op (findIndex
  // returns -1) so the user would silently never see the promise result.
  // Normal toasts therefore share the cap among themselves, independent of
  // any loading toasts that happen to be on screen at the same time.
  const cappedIds: string[] = [];
  for (const t of toasts.value) {
    if (t.isLeaving) continue;
    if (t.duration === Infinity) continue; // protected: not counted, not droppable
    cappedIds.push(t.id);
  }

  const overflow = cappedIds.length - max;
  if (overflow <= 0) return;

  // drop-oldest → drop the tail of the capped list (oldest inserts, deepest
  //   in stack).
  // drop-newest → drop the head of the capped list (newest inserts,
  //   including the one just added).
  const idsToDrop =
    queueCap.overflow === "drop-newest"
      ? cappedIds.slice(0, overflow)
      : cappedIds.slice(-overflow);

  const dropSet = new Set(idsToDrop);
  for (const id of dropSet) {
    timerMap.delete(id);
    toastIndex.delete(id);
  }
  toasts.value = toasts.value.filter((t) => !dropSet.has(t.id));
};

const setMaxQueue = (max: number, overflow: QueueOverflow = "drop-oldest") => {
  queueCap.max = max;
  queueCap.overflow = overflow;
  enforceCap();
};

// Default volume used when a toast does not set its own soundVolume.
// Configured by the plugin / container so the global `soundVolume` prop
// actually takes effect instead of being shadowed by a hardcoded 0.5.
let defaultSoundVolume = 0.5;
const setDefaultSoundVolume = (vol: number) => {
  defaultSoundVolume = Math.max(0, Math.min(1, vol));
};

// ─── Computed ─────────────────────────────────────────────────────────────────

// Cache per-position computed refs so every call returns the SAME ComputedRef
// instance. Without this, ToastRegion's `computed(() => store.getToastsByPosition(p).value)`
// would create a brand-new computed on every re-evaluation, breaking the reactive
// chain and re-running the filter on each tick. Positions are a fixed 10-value enum
// so the cache never leaks.
const positionComputedCache = new Map<ToastPosition, ComputedRef<Toast[]>>();

const getToastsByPosition = (position: ToastPosition): ComputedRef<Toast[]> => {
  let cached = positionComputedCache.get(position);
  if (!cached) {
    cached = computed(() => toasts.value.filter((t) => t.position === position));
    positionComputedCache.set(position, cached);
  }
  return cached;
};

const allToasts = computed(() => toasts.value);

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Add a toast — or UPDATE an existing one if the same `id` is already visible.
 * This automatic deduplication means calling softToast.error('Oops', { id: 'network-error' })
 * five times in a row results in ONE toast that refreshes its content each time.
 */
const add = (options: ToastOptions): string => {
  const id = options.id || generateId();

  // ── Smart Dedup: same id already exists → update instead of creating ──
  // O(1) lookup via toastIndex instead of findIndex over the array.
  const existing = toastIndex.get(id);
  if (existing && !existing.isLeaving) {
    const existingIndex = toasts.value.indexOf(existing);
    // Patch the existing toast with new content
    toasts.value[existingIndex] = {
      ...existing,
      ...options,
      id,
      // Reset timer so user has time to read the updated content
      remainingTime: options.duration ?? existing.duration,
      isPaused: existing.isPaused,
      isLeaving: false,
    };
    // Refresh the index + timerMap with the new toast object (in-place
    // replace above created a new reference).
    toastIndex.set(id, toasts.value[existingIndex]);
    resetTimer(id, toasts.value[existingIndex], options.duration ?? existing.duration, existing.isPaused);
    // Play sound again if configured (content changed)
    const sound = options.sound;
    const vol = options.soundVolume ?? defaultSoundVolume;
    if (sound) playToastSound(options.type ?? existing.type, sound, vol);
    return id;
  }

  // ── New toast ──
  // Reusing a public ID during exit must not leave two Vue nodes with the
  // same key. Remove the old generation before mounting its replacement.
  if (existing?.isLeaving) removeToastInstance(existing);

  const duration = options.duration ?? defaultOptions.duration;
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
  };

  // Insert first, then register the timer + index with the same toast reference
  // so the RAF loop and pause/resume can read toast fields in O(1).
  toasts.value.unshift(toast);
  toastIndex.set(id, toast);
  resetTimer(id, toast, duration, false);
  enforceCap();
  startTickLoop();

  // Only play sound if the toast survived the cap (drop-newest may remove it).
  const sound = options.sound;
  if (sound) {
    const survived = toastIndex.has(id);
    if (survived) {
      const vol = options.soundVolume ?? defaultSoundVolume;
      playToastSound(toast.type, sound, vol);
    }
  }

  return id;
};

const update = (id: string, options: Partial<ToastOptions>) => {
  const existing = toastIndex.get(id);
  if (!existing) return;
  const index = toasts.value.indexOf(existing);
  if (index === -1) return;
  const nextDuration = options.duration ?? existing.duration;
  const nextRemainingTime =
    options.duration === undefined ? existing.remainingTime : nextDuration;
  toasts.value[index] = {
    ...existing,
    ...options,
    remainingTime: nextRemainingTime,
  };
  // Refresh the index so future lookups see the new toast object.
  toastIndex.set(id, toasts.value[index]);
  if (options.duration !== undefined) {
    // Duration changed → full reset (also refreshes the stored toast ref).
    resetTimer(id, toasts.value[index], nextDuration, existing.isPaused);
  } else {
    // No duration change → still update the stored ref so the RAF loop does
    // not read a stale toast object after the spread above replaced it.
    const timer = timerMap.get(id);
    if (timer) timer.toast = toasts.value[index];
  }
};

const dismiss = (id?: string | { type?: ToastType | ToastType[] }) => {
  if (!id) {
    // Capture exact object generations so toasts added during the exit window,
    // including replacements with reused public IDs, survive cleanup.
    const toastsToDismiss = toasts.value.filter((t) => !t.isLeaving);
    toastsToDismiss.forEach((t) => {
      t.isLeaving = true;
      t.onDismiss?.(t.id);
      const timer = timerMap.get(t.id);
      if (timer?.toast === t) timerMap.delete(t.id);
    });
    setTimeout(() => {
      toastsToDismiss.forEach(removeToastInstance);
    }, EXIT_REMOVE_DELAY_MS);
    return;
  }

  if (typeof id === "string") {
    const toast = toastIndex.get(id);
    if (toast && !toast.isLeaving) {
      toast.isLeaving = true;
      toast.onDismiss?.(id);
      const timer = timerMap.get(id);
      if (timer?.toast === toast) timerMap.delete(id);
      setTimeout(() => {
        removeToastInstance(toast);
      }, EXIT_REMOVE_DELAY_MS);
    }
  } else {
    const types = Array.isArray(id.type) ? id.type : [id.type];
    // Capture only the matching generations that exist now. Later same-type
    // toasts must not be wiped when this exit window completes.
    const toastsToDismiss = toasts.value.filter(
      (t) => !t.isLeaving && types.includes(t.type),
    );
    toastsToDismiss.forEach((t) => {
      t.isLeaving = true;
      t.onDismiss?.(t.id);
      const timer = timerMap.get(t.id);
      if (timer?.toast === t) timerMap.delete(t.id);
    });
    setTimeout(() => {
      toastsToDismiss.forEach(removeToastInstance);
    }, EXIT_REMOVE_DELAY_MS);
  }
};

const pause = (id: string) => {
  const timer = timerMap.get(id);
  if (timer) timer.isPaused = true;
  const toast = toastIndex.get(id);
  if (toast) toast.isPaused = true;
};

const resume = (id: string) => {
  const timer = timerMap.get(id);
  if (timer) timer.isPaused = false;
  const toast = toastIndex.get(id);
  if (toast) toast.isPaused = false;
  // P1: the RAF loop may have stopped itself when every timer was paused. A
  // resume means there is now work to do again — kick the loop back on.
  startTickLoop();
};

const expand = (id: string) => {
  const toast = toastIndex.get(id);
  if (toast) toast.isExpanded = true;
};

const collapse = (id: string) => {
  const toast = toastIndex.get(id);
  if (toast) toast.isExpanded = false;
};

// ─── Global RAF tick loop ─────────────────────────────────────────────────────

let lastTime = 0;
let rafId: number | null = null;

// P4: clamp per-frame delta so a long-hidden tab (browser throttles RAF to
// ~1Hz) does not blow away every toast the moment the tab becomes visible
// again. 100ms is the smallest interval at which a user still perceives
// smooth countdown — anything larger would let timers drift visibly.
const MAX_FRAME_DELTA_MS = 100;

// Returns true if at least one timer is currently ticking (not paused, not
// for an Infinity-duration toast). The RAF loop uses this to decide whether
// to keep running: if every toast is paused or loading, we can sleep instead
// of spinning 60fps doing nothing (P1 — saves battery on mobile).
const hasActiveTimer = () => {
  for (const timer of timerMap.values()) {
    if (!timer.isPaused && timer.toast && !timer.toast.isLeaving) return true;
  }
  return false;
};

const stopTickLoop = () => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  lastTime = 0;
};

// P3: cancel the RAF when the page is hidden/unloaded so we never leak a
// scheduled frame across a tab close or bfcache restore.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", stopTickLoop, { once: true });
}

const startTickLoop = () => {
  if (rafId !== null) return;
  if (typeof window === "undefined") return;
  // P1: do not spin a frame if there is nothing to tick (every toast is
  // paused or loading). The next add()/resume() will restart the loop.
  if (!hasActiveTimer()) return;

  const loop = (currentTime: number) => {
    if (lastTime === 0) lastTime = currentTime;
    // P4: clamp delta — protects against huge jumps after tab visibility.
    const delta = Math.min(currentTime - lastTime, MAX_FRAME_DELTA_MS);
    lastTime = currentTime;

    // Tick non-reactive timer map — zero Vue reactivity cost per frame.
    // Reads toast fields via the stored reference (O(1) per timer) instead of
    // scanning toasts.value (which would be O(n) per timer → O(n²) per frame).
    const expiredIds: string[] = [];
    timerMap.forEach((timer, id) => {
      if (timer.isPaused) return;
      const toast = timer.toast;
      if (!toast || toast.isLeaving || toast.duration === Infinity) return;
      timer.remainingTime -= delta;
      // Sync remainingTime back to toast only for progress bar consumers
      if (toast.showProgress) toast.remainingTime = timer.remainingTime;
      if (timer.remainingTime <= 0) expiredIds.push(id);
    });

    // Mutate Vue state only when a toast actually expires. Read the toast from
    // the timer entry before deleting it (still O(1)).
    for (const id of expiredIds) {
      const toast = timerMap.get(id)?.toast;
      timerMap.delete(id);
      if (toast && !toast.isLeaving) {
        toast.isLeaving = true;
        toast.onAutoClose?.(id);
        setTimeout(() => {
          removeToastInstance(toast);
        }, EXIT_REMOVE_DELAY_MS);
      }
    }

    // P1: keep the loop alive only while there is at least one active timer.
    // Previously this checked toasts.value.length, which kept the RAF spinning
    // even when every toast was paused or had duration = Infinity (loading).
    if (hasActiveTimer()) {
      rafId = requestAnimationFrame(loop);
    } else {
      rafId = null;
      lastTime = 0;
    }
  };

  rafId = requestAnimationFrame(loop);
};

// ─── Type helpers ─────────────────────────────────────────────────────────────

const success = (
  title: string,
  options?: Omit<ToastOptions, "type" | "title">,
) => add({ ...options, type: "success", title });

const error = (title: string, options?: Omit<ToastOptions, "type" | "title">) =>
  add({ ...options, type: "error", title });

const warning = (
  title: string,
  options?: Omit<ToastOptions, "type" | "title">,
) => add({ ...options, type: "warning", title });

const info = (title: string, options?: Omit<ToastOptions, "type" | "title">) =>
  add({ ...options, type: "info", title });

const loading = (
  title: string,
  options?: Omit<ToastOptions, "type" | "title">,
) => add({ ...options, type: "promise", title, duration: Infinity });

const promise = async <T>(
  promiseFn: Promise<T>,
  messages: ToastPromiseMessages<T>,
  options?: Omit<ToastOptions, "type" | "promise" | "promiseMessages">,
): Promise<T> => {
  const id = add({
    ...options,
    type: "promise",
    title: messages.loading,
    duration: Infinity,
  });

  try {
    const result = await promiseFn;
    update(id, {
      type: "success",
      title:
        typeof messages.success === "function"
          ? messages.success(result)
          : messages.success,
      description:
        typeof messages.description?.success === "function"
          ? messages.description.success(result)
          : messages.description?.success,
      duration: 4000,
    });
    return result;
  } catch (err) {
    update(id, {
      type: "error",
      title:
        typeof messages.error === "function"
          ? messages.error(err)
          : messages.error,
      description:
        typeof messages.description?.error === "function"
          ? messages.description.error(err)
          : messages.description?.error,
      action: messages.action?.error,
      duration: 6000,
    });
    throw err;
  }
};

const clearAll = () => {
  timerMap.clear();
  toastIndex.clear();
  toasts.value = [];
};

const remove = (target: string | Toast) => {
  const toast = typeof target === "string" ? toastIndex.get(target) : target;
  if (toast) removeToastInstance(toast);
};

// ─── Store interface + export ─────────────────────────────────────────────────

export interface ToastStore {
  toasts: ComputedRef<Toast[]>;
  getToastsByPosition: (position: ToastPosition) => ComputedRef<Toast[]>;
  add: (options: ToastOptions) => string;
  update: (id: string, options: Partial<ToastOptions>) => void;
  dismiss: (id?: string | { type?: ToastType | ToastType[] }) => void;
  pause: (id: string) => void;
  resume: (id: string) => void;
  expand: (id: string) => void;
  collapse: (id: string) => void;
  setMaxQueue: (max: number, overflow?: QueueOverflow) => void;
  setDefaultSoundVolume: (vol: number) => void;
  success: (
    title: string,
    options?: Omit<ToastOptions, "type" | "title">,
  ) => string;
  error: (
    title: string,
    options?: Omit<ToastOptions, "type" | "title">,
  ) => string;
  warning: (
    title: string,
    options?: Omit<ToastOptions, "type" | "title">,
  ) => string;
  info: (
    title: string,
    options?: Omit<ToastOptions, "type" | "title">,
  ) => string;
  loading: (
    title: string,
    options?: Omit<ToastOptions, "type" | "title">,
  ) => string;
  promise: <T>(
    promiseFn: Promise<T>,
    messages: ToastPromiseMessages<T>,
    options?: Omit<ToastOptions, "type" | "promise" | "promiseMessages">,
  ) => Promise<T>;
  clearAll: () => void;
  remove: (target: string | Toast) => void;
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
  setMaxQueue,
  setDefaultSoundVolume,
  success,
  error,
  warning,
  info,
  loading,
  promise,
  clearAll,
  remove,
};
