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

  // Collect active (non-leaving) ids in array order: index 0 = newest.
  const activeIds: string[] = [];
  for (const t of toasts.value) {
    if (!t.isLeaving) activeIds.push(t.id);
  }

  const overflow = activeIds.length - max;
  if (overflow <= 0) return;

  // drop-oldest → drop the tail of the array (oldest inserts, deepest in stack).
  // drop-newest → drop the head of the array (newest inserts, including the one just added).
  const idsToDrop =
    queueCap.overflow === "drop-newest"
      ? activeIds.slice(0, overflow)
      : activeIds.slice(-overflow);

  const dropSet = new Set(idsToDrop);
  for (const id of dropSet) timerMap.delete(id);
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
  const existingIndex = toasts.value.findIndex((t) => t.id === id);
  if (existingIndex !== -1 && !toasts.value[existingIndex].isLeaving) {
    const existing = toasts.value[existingIndex];
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
    // Pass the new toast object so timerMap never keeps a stale ref after dedup.
    resetTimer(id, toasts.value[existingIndex], options.duration ?? existing.duration, existing.isPaused);
    // Play sound again if configured (content changed)
    const sound = options.sound;
    const vol = options.soundVolume ?? defaultSoundVolume;
    if (sound) playToastSound(options.type ?? existing.type, sound, vol);
    return id;
  }

  // ── New toast ──
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

  // Insert first, then register the timer with the same toast reference so the
  // RAF loop can read toast fields via the map in O(1).
  toasts.value.unshift(toast);
  resetTimer(id, toast, duration, false);
  enforceCap();
  startTickLoop();

  // Only play sound if the toast survived the cap (drop-newest may remove it).
  const sound = options.sound;
  if (sound) {
    const survived = toasts.value.some((t) => t.id === id);
    if (survived) {
      const vol = options.soundVolume ?? defaultSoundVolume;
      playToastSound(toast.type, sound, vol);
    }
  }

  return id;
};

const update = (id: string, options: Partial<ToastOptions>) => {
  const index = toasts.value.findIndex((t) => t.id === id);
  if (index !== -1) {
    const existing = toasts.value[index];
    const nextDuration = options.duration ?? existing.duration;
    const nextRemainingTime =
      options.duration === undefined ? existing.remainingTime : nextDuration;
    toasts.value[index] = {
      ...existing,
      ...options,
      remainingTime: nextRemainingTime,
    };
    if (options.duration !== undefined) {
      // Duration changed → full reset (also refreshes the stored toast ref).
      resetTimer(id, toasts.value[index], nextDuration, existing.isPaused);
    } else {
      // No duration change → still update the stored ref so the RAF loop does
      // not read a stale toast object after the spread above replaced it.
      const timer = timerMap.get(id);
      if (timer) timer.toast = toasts.value[index];
    }
  }
};

const dismiss = (id?: string | { type?: ToastType | ToastType[] }) => {
  if (!id) {
    toasts.value.forEach((t) => {
      t.isLeaving = true;
    });
    timerMap.clear();
    setTimeout(() => {
      toasts.value = [];
    }, EXIT_REMOVE_DELAY_MS);
    return;
  }

  if (typeof id === "string") {
    const toast = toasts.value.find((t) => t.id === id);
    if (toast) {
      toast.isLeaving = true;
      toast.onDismiss?.(id);
      timerMap.delete(id);
      setTimeout(() => {
        toasts.value = toasts.value.filter((t) => t.id !== id);
      }, EXIT_REMOVE_DELAY_MS);
    }
  } else {
    const types = Array.isArray(id.type) ? id.type : [id.type];
    toasts.value.forEach((t) => {
      if (types.includes(t.type)) {
        t.isLeaving = true;
        t.onDismiss?.(t.id);
        timerMap.delete(t.id);
      }
    });
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => !types.includes(t.type));
    }, EXIT_REMOVE_DELAY_MS);
  }
};

const pause = (id: string) => {
  const timer = timerMap.get(id);
  if (timer) timer.isPaused = true;
  const toast = toasts.value.find((t) => t.id === id);
  if (toast) toast.isPaused = true;
};

const resume = (id: string) => {
  const timer = timerMap.get(id);
  if (timer) timer.isPaused = false;
  const toast = toasts.value.find((t) => t.id === id);
  if (toast) toast.isPaused = false;
};

const expand = (id: string) => {
  const toast = toasts.value.find((t) => t.id === id);
  if (toast) toast.isExpanded = true;
};

const collapse = (id: string) => {
  const toast = toasts.value.find((t) => t.id === id);
  if (toast) toast.isExpanded = false;
};

// ─── Global RAF tick loop ─────────────────────────────────────────────────────

let lastTime = 0;
let rafId: number | null = null;

const startTickLoop = () => {
  if (rafId !== null) return;
  if (typeof window === "undefined") return;

  const loop = (currentTime: number) => {
    if (lastTime === 0) lastTime = currentTime;
    const delta = currentTime - lastTime;
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
          toasts.value = toasts.value.filter((t) => t.id !== id);
        }, EXIT_REMOVE_DELAY_MS);
      }
    }

    if (toasts.value.length > 0) {
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
  toasts.value = [];
};

const remove = (id: string) => {
  timerMap.delete(id);
  toasts.value = toasts.value.filter((t) => t.id !== id);
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
  remove: (id: string) => void;
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
