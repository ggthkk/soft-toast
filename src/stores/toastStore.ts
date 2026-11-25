import { ref, computed, type ComputedRef } from "vue";
import type {
  Toast,
  ToastOptions,
  ToastType,
  ToastContainerProps,
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

// Resolve defaults at creation so calls outside Vue use the same configuration.
const definedOptions = <T extends object>(options: T): Partial<T> =>
  Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) as Partial<T>;

let configuredDefaults: ToastOptions = {};
export const setToastDefaults = (options: ToastContainerProps) => {
  const { position, duration, preset, spring, bounce, showTimestamp, showProgress,
    closeButton, sound, soundVolume, toastOptions } = options;
  configuredDefaults = {
    ...definedOptions({ position, duration, preset, spring, bounce, showTimestamp,
      showProgress, closeButton, sound, soundVolume }),
    ...definedOptions(toastOptions ?? {}),
  };
};

// ─── Reactive state ───────────────────────────────────────────────────────────

const toasts = ref<Toast[]>([]);

interface Deadline {
  at: number;
  handle?: ReturnType<typeof setTimeout>;
}
const deadlines = new Map<string, Deadline>();
const manuallyPaused = new Set<string>();
let pageHidden = typeof document !== "undefined" && document.hidden;

export const getRemainingTime = (toast: Toast) => {
  const deadline = deadlines.get(toast.id);
  return deadline && toastIndex.get(toast.id) === toast
    ? Math.max(0, deadline.at - performance.now())
    : toast.remainingTime;
};

const cancelDeadline = (id: string) => {
  clearTimeout(deadlines.get(id)?.handle);
  deadlines.delete(id);
};

// id → Toast reference index. Kept in sync with toasts.value so pause/resume/
// expand/collapse/dismiss-by-id can find a toast in O(1) instead of scanning
// the array (was O(n) per call → O(n²) when the visibility handler pauses
// every toast on tab-hide). Note: the index holds the CURRENT toast object —
// callers that replace a toast in place (add/dedup, update) must refresh it.
const toastIndex = new Map<string, Toast>();

// Remove exactly one toast generation. Public IDs are reusable, so delayed
// cleanup must not resolve an ID again after a newer toast may have claimed it.
const removeToastInstance = (toast: Toast) => {
  if (toastIndex.get(toast.id) === toast) {
    cancelDeadline(toast.id);
    manuallyPaused.delete(toast.id);
    toastIndex.delete(toast.id);
  }

  const index = toasts.value.indexOf(toast);
  if (index !== -1) toasts.value.splice(index, 1);
};

const scheduleDeadline = (toast: Toast) => {
  const { id, remainingTime } = toast;
  cancelDeadline(id);
  if (typeof window === "undefined" || toast.isPaused || toast.isLeaving ||
      !Number.isFinite(remainingTime)) return;

  const deadline: Deadline = { at: performance.now() + remainingTime };
  deadlines.set(id, deadline);
  const wake = () => {
    if (deadlines.get(id) !== deadline) return;
    const left = deadline.at - performance.now();
    if (left > 0) {
      // Browser timeouts accept at most a signed 32-bit delay.
      deadline.handle = setTimeout(wake, Math.min(Math.ceil(left), 0x7fffffff));
      return;
    }
    deadlines.delete(id);
    const current = toastIndex.get(id);
    if (!current || current.isLeaving) return;
    current.remainingTime = 0;
    current.isLeaving = true;
    setTimeout(() => removeToastInstance(current), EXIT_REMOVE_DELAY_MS);
    current.onAutoClose?.(id);
  };
  deadline.handle = setTimeout(wake, Math.min(Math.max(0, Math.ceil(remainingTime)), 0x7fffffff));
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
    cancelDeadline(id);
    manuallyPaused.delete(id);
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
      ...definedOptions(options),
      id,
      // Reset timer so user has time to read the updated content
      remainingTime: options.duration ?? existing.duration,
      isPaused: existing.isPaused,
      isLeaving: false,
    };
    toastIndex.set(id, toasts.value[existingIndex]);
    scheduleDeadline(toasts.value[existingIndex]);
    // Play sound again if configured (content changed)
    const sound = options.sound ?? configuredDefaults.sound;
    const vol = options.soundVolume ?? configuredDefaults.soundVolume ?? defaultSoundVolume;
    if (sound) playToastSound(options.type ?? existing.type, sound, vol);
    return id;
  }

  // ── New toast ──
  // Reusing a public ID during exit must not leave two Vue nodes with the
  // same key. Remove the old generation before mounting its replacement.
  if (existing?.isLeaving) removeToastInstance(existing);

  const merged = { ...defaultOptions, ...configuredDefaults, ...definedOptions(options) };
  const duration = merged.duration;
  const toast: Toast = {
    ...merged,
    classNames: options.classNames && configuredDefaults.classNames
      ? { ...configuredDefaults.classNames, ...options.classNames }
      : merged.classNames,
    id,
    createdAt: Date.now(),
    remainingTime: duration,
    isPaused: pageHidden,
    isExpanded: true,
    isLeaving: false,
  };

  toasts.value.unshift(toast);
  const storedToast = toasts.value[0];
  toastIndex.set(id, storedToast);
  enforceCap();
  if (!toastIndex.has(id)) return id;
  scheduleDeadline(storedToast);
  if (merged.sound) playToastSound(toast.type, merged.sound, merged.soundVolume ?? defaultSoundVolume);

  return id;
};

const update = (id: string, options: Partial<ToastOptions>) => {
  const existing = toastIndex.get(id);
  if (!existing || existing.isLeaving) return;
  const index = toasts.value.indexOf(existing);
  if (index === -1) return;
  const nextDuration = options.duration ?? existing.duration;
  const nextRemainingTime =
    options.duration === undefined ? getRemainingTime(existing) : nextDuration;
  toasts.value[index] = {
    ...existing,
    ...definedOptions(options),
    id,
    remainingTime: nextRemainingTime,
  };
  // Refresh the index so future lookups see the new toast object.
  toastIndex.set(id, toasts.value[index]);
  if (options.duration !== undefined) scheduleDeadline(toasts.value[index]);
};

const dismiss = (id?: string | { type?: ToastType | ToastType[] }) => {
  if (!id) {
    // Capture exact object generations so toasts added during the exit window,
    // including replacements with reused public IDs, survive cleanup.
    const toastsToDismiss = toasts.value.filter((t) => !t.isLeaving);
    toastsToDismiss.forEach((t) => {
      t.isLeaving = true;
      if (toastIndex.get(t.id) === t) cancelDeadline(t.id);
      t.onDismiss?.(t.id);
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
      cancelDeadline(id);
      toast.onDismiss?.(id);
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
      if (toastIndex.get(t.id) === t) cancelDeadline(t.id);
      t.onDismiss?.(t.id);
    });
    setTimeout(() => {
      toastsToDismiss.forEach(removeToastInstance);
    }, EXIT_REMOVE_DELAY_MS);
  }
};

const syncPaused = (toast: Toast) => {
  const paused = pageHidden || manuallyPaused.has(toast.id);
  if (toast.isLeaving || toast.isPaused === paused) return;
  toast.remainingTime = getRemainingTime(toast);
  toast.isPaused = paused;
  scheduleDeadline(toast);
};

const pause = (id: string) => {
  const toast = toastIndex.get(id);
  if (!toast || toast.isLeaving) return;
  manuallyPaused.add(id);
  syncPaused(toast);
};

const resume = (id: string) => {
  manuallyPaused.delete(id);
  const toast = toastIndex.get(id);
  if (toast) syncPaused(toast);
};

export const setPageHidden = (hidden: boolean) => {
  pageHidden = hidden;
  toastIndex.forEach(syncPaused);
};

const expand = (id: string) => {
  const toast = toastIndex.get(id);
  if (toast) toast.isExpanded = true;
};

const collapse = (id: string) => {
  const toast = toastIndex.get(id);
  if (toast) toast.isExpanded = false;
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
      duration: options?.duration ?? configuredDefaults.duration ?? 4000,
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
      duration: options?.duration ?? configuredDefaults.duration ?? 6000,
    });
    throw err;
  }
};

const clearAll = () => {
  deadlines.forEach((_, id) => cancelDeadline(id));
  manuallyPaused.clear();
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
  getRemainingTime: (toast: Toast) => number;
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
  getRemainingTime,
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
