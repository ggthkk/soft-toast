<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import type { ToastContainerProps } from "../types";
import { toastStore } from "../stores/toastStore";
import ToastItem from "./ToastItem.vue";
import { reduceToastMotion } from "../animations/gsapConfig";
import { gsap } from "gsap";

// Props with defaults
const props = withDefaults(defineProps<ToastContainerProps>(), {
  position: "top-right",
  duration: 5000,
  gap: 12,
  theme: "light",
  spring: true,
  bounce: 0.4,
  preset: "smooth",
  closeButton: false,
  showProgress: false,
  showTimestamp: false,
  maxQueue: 10,
  queueOverflow: "drop-oldest",
  dir: "ltr",
  swipeToDismiss: true,
});

// Container ref for position calculations
const containerRef = ref<HTMLElement | null>(null);
const stackRef = ref<HTMLElement | null>(null);
const listRef = ref<HTMLElement | null>(null);
// Get toasts for this container's position
const positionToasts = computed(() => {
  return toastStore.getToastsByPosition(props.position).value;
});

onMounted(() => {
  // iOS: collapse expanded stack when tapping outside
  document.addEventListener("touchstart", handleOutsideTap, { passive: true });

  // Must be non-passive to call preventDefault and block page scroll when expanded
  stackRef.value?.addEventListener("touchmove", handleStackTouchMove, {
    passive: false,
  });

  if (typeof ResizeObserver !== "undefined") {
    itemResizeObserver = new ResizeObserver(() => measureOffsets());
  }
  // Set initial height
  nextTick(() => measureOffsets());
});

onUnmounted(() => {
  document.removeEventListener("touchstart", handleOutsideTap);
  stackRef.value?.removeEventListener("touchmove", handleStackTouchMove);
  if (measureRafId !== null) cancelAnimationFrame(measureRafId);
  if (itemResizeObserver) itemResizeObserver.disconnect();
  clearCollapseTimer();
  observedItems.clear();
});

// Position classes
const positionClass = computed(() => `soft-toast-container--${props.position}`);
const isCenterAligned = computed(() => props.position.endsWith("-center"));

// Visual Indexing (ignore leaving toasts so the stack closes gaps instantly).
// Build an id → visual-index Map once per activeToasts change so template
// lookups are O(1) instead of O(n) findIndex per toast (was O(n²) per render).
const activeToasts = computed(() =>
  positionToasts.value.filter((t) => !t.isLeaving),
);
const activeIndexById = computed(() => {
  const map = new Map<string, number>();
  for (let i = 0; i < activeToasts.value.length; i++) {
    map.set(activeToasts.value[i].id, i);
  }
  return map;
});
const getVisualIndex = (toast: any, realIdx: number) => {
  if (toast.isLeaving) return realIdx; // Keep its place while animating out
  return activeIndexById.value.get(toast.id) ?? -1;
};

// Stack expansion (hover or focus reveals the stack)
const isExpanded = ref(false);
let collapseTimerId: number | null = null;

const clearCollapseTimer = () => {
  if (collapseTimerId === null) return;
  window.clearTimeout(collapseTimerId);
  collapseTimerId = null;
};

// DOM cap: keep a bounded, stable window mounted so expanding does not
// introduce new nodes mid-animation. Collapsed positioning still hides items
// after the front 3 via opacity/pointer-events.
// Derive from maxQueue (clamped to at least 15) so the render window never
// silently diverges from the queue cap — a hard-coded 15 used to mask the cap
// being unimplemented.
const expandedDomCap = computed(() =>
  Math.max(15, Number.isFinite(props.maxQueue) ? (props.maxQueue ?? 15) : 15),
);
const renderedToasts = computed(() => {
  const all = positionToasts.value;
  const windowed = all.slice(0, expandedDomCap.value);
  // Keep leaving toasts so their exit animation plays even if they fall
  // outside the normal render window.
  const leaving = all.filter((t) => t.isLeaving);
  const seen = new Set(windowed.map((t) => t.id));
  return [...windowed, ...leaving.filter((t) => !seen.has(t.id))];
});

// Measured cumulative offsets for each item when stack is expanded.
// Keyed by toast id so order of renderedToasts doesn't matter.
const expandedOffsets = ref<Record<string, number>>({});
const frontHeight = ref(0);
const totalHeight = ref(0);

let measureRafId: number | null = null;
const measureOffsets = () => {
  if (measureRafId !== null) return; // already scheduled
  measureRafId = requestAnimationFrame(() => {
    measureRafId = null;
    _doMeasureOffsets();
  });
};

const hasOffsetChanges = (
  nextOffsets: Record<string, number>,
  nextFrontHeight: number,
  nextTotalHeight: number,
) => {
  if (frontHeight.value !== nextFrontHeight) return true;
  if (totalHeight.value !== nextTotalHeight) return true;
  const current = expandedOffsets.value;
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(nextOffsets);
  if (currentKeys.length !== nextKeys.length) return true;
  return nextKeys.some((key) => current[key] !== nextOffsets[key]);
};

const _doMeasureOffsets = () => {
  if (!listRef.value) return;
  const items = Array.from(listRef.value.children) as HTMLElement[];
  observeToastItems(items);
  const gapPx = props.gap;
  const offsetMap: Record<string, number> = Object.create(null);
  let cumulative = 0;
  let firstActiveHeight = 0;
  for (const item of items) {
    const id = item.dataset.toastId;
    if (id === undefined) continue;
    offsetMap[id] = cumulative;
    if (item.dataset.leaving === "true") continue;
    const height = item.offsetHeight;
    if (item.dataset.stIndex === "0") firstActiveHeight = height;
    cumulative += height + gapPx;
  }
  const nextTotalHeight = Math.max(0, cumulative - gapPx);
  const changed = hasOffsetChanges(offsetMap, firstActiveHeight, nextTotalHeight);
  if (changed) {
    expandedOffsets.value = offsetMap;
    frontHeight.value = firstActiveHeight;
    totalHeight.value = nextTotalHeight;
  }

  // Re-clamp scroll if height changes while expanded
  if (isExpanded.value && listRef.value && changed) {
    clampAndApplyScroll(0); // Applies bounds check without adding new delta
  }

  // Keep the hover area in sync with the measured stack.
  if (listRef.value && changed) {
    const target = isExpanded.value ? totalHeight.value : frontHeight.value;
    listRef.value.style.height = `${target}px`;
  }

};

watch([renderedToasts, activeToasts, () => props.gap], measureOffsets, { flush: "post" });

// Custom GSAP Scrolling
const currentScrollY = ref(0);

const getScrollBounds = () => {
  const buffer = 120;
  const maxScrollNeeded = Math.max(
    0,
    totalHeight.value - window.innerHeight + buffer,
  );

  return stackDirection.value === "up"
    ? { min: 0, max: maxScrollNeeded }
    : { min: -maxScrollNeeded, max: 0 };
};

const applyStackScrollY = (
  nextY: number,
  animate = true,
  duration = 0.18,
  ease = "power2.out",
) => {
  if (!listRef.value) return;
  const { min, max } = getScrollBounds();
  currentScrollY.value = Math.max(min, Math.min(nextY, max));

  if (!animate || reduceToastMotion(listRef.value)) {
    gsap.set(listRef.value, {
      y: currentScrollY.value,
      force3D: true,
      overwrite: true,
    });
    return;
  }

  gsap.to(listRef.value, {
    y: currentScrollY.value,
    duration,
    ease,
    overwrite: "auto",
  });
};

const clampAndApplyScroll = (deltaY: number, animate = true) => {
  applyStackScrollY(currentScrollY.value - deltaY, animate);
};

const handleWheel = (e: WheelEvent) => {
  if (!isExpanded.value) return;

  // If we don't need to scroll the main stack, don't prevent default so page can scroll normally
  const maxScrollNeeded = Math.max(
    0,
    totalHeight.value - window.innerHeight + 120,
  );
  if (maxScrollNeeded <= 0) return;

  e.preventDefault();
  clampAndApplyScroll(e.deltaY);
};

// Cards animate via transforms while the hover area updates once.
const applyListHeight = (expanded: boolean) => {
  if (!listRef.value) return;
  const target = expanded ? totalHeight.value : frontHeight.value;
  listRef.value.style.height = `${target}px`;
};

let itemResizeObserver: ResizeObserver | null = null;
const observedItems = new Set<HTMLElement>();

const observeToastItems = (items: HTMLElement[]) => {
  if (!itemResizeObserver) return;
  for (const item of observedItems) {
    if (item.parentElement === listRef.value) continue;
    itemResizeObserver.unobserve(item);
    observedItems.delete(item);
  }
  for (const item of items) {
    if (observedItems.has(item)) continue;
    observedItems.add(item);
    itemResizeObserver.observe(item);
  }
};

const handleStackEnter = () => {
  clearCollapseTimer();
  if (isExpanded.value) return;
  isExpanded.value = true;
  nextTick(() => {
    _doMeasureOffsets();
    applyListHeight(true);
  });
};
const handleStackLeave = () => {
  clearCollapseTimer();
  collapseTimerId = window.setTimeout(() => {
    collapseTimerId = null;
    isExpanded.value = false;
    applyListHeight(false);
    // Reset GSAP scroll when mouse leaves
    currentScrollY.value = 0;
    if (listRef.value) {
      applyStackScrollY(0, true, 0.2);
    }
  }, 80);
};

// iOS/touch: distinguish tap vs scroll before acting
let tapStartX = 0;
let tapStartY = 0;
let touchScrollLastY = 0;
let touchScrollLastTime = 0;
let touchScrollVelocity = 0;
let touchDidScroll = false;

const handleStackTouchStart = (e: TouchEvent) => {
  tapStartX = e.touches[0].clientX;
  tapStartY = e.touches[0].clientY;
  touchScrollLastY = e.touches[0].clientY;
  touchScrollLastTime = performance.now();
  touchScrollVelocity = 0;
  touchDidScroll = false;
  if (listRef.value) gsap.killTweensOf(listRef.value);
};

const handleStackTouchEnd = (e: TouchEvent) => {
  if (positionToasts.value.length <= 1) return;
  const dx = Math.abs((e.changedTouches[0]?.clientX ?? tapStartX) - tapStartX);
  const dy = Math.abs((e.changedTouches[0]?.clientY ?? tapStartY) - tapStartY);
  // If finger moved more than 8px it was a scroll/swipe, not a tap
  if (dx > 8 || dy > 8) {
    if (isExpanded.value && touchDidScroll && Math.abs(touchScrollVelocity) > 0.08) {
      const momentumDistance = Math.max(
        -460,
        Math.min(touchScrollVelocity * 560, 460),
      );
      const duration = Math.max(
        0.32,
        Math.min(Math.abs(momentumDistance) / 780, 0.62),
      );
      applyStackScrollY(
        currentScrollY.value + momentumDistance,
        true,
        duration,
        "power3.out",
      );
    }
    return;
  }
  if (isExpanded.value) {
    handleStackLeave();
  } else {
    e.preventDefault();
    handleStackEnter();
  }
};

const handleOutsideTap = (e: TouchEvent) => {
  if (!isExpanded.value) return;
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    handleStackLeave();
  }
};

// Prevent page scroll bleeding through AND scroll the list when stack is expanded
const handleStackTouchMove = (e: TouchEvent) => {
  if (!isExpanded.value) return;
  e.preventDefault();

  const currentY = e.touches[0].clientY;
  const deltaY = touchScrollLastY - currentY; // positive = scrolling down
  const now = performance.now();
  const dt = Math.max(1, now - touchScrollLastTime);
  touchScrollLastY = currentY;
  touchScrollLastTime = now;

  const maxScrollNeeded = Math.max(
    0,
    totalHeight.value - window.innerHeight + 120,
  );
  if (maxScrollNeeded <= 0) return;

  const previousScrollY = currentScrollY.value;
  clampAndApplyScroll(deltaY, false);
  const instantVelocity = (currentScrollY.value - previousScrollY) / dt;
  touchScrollVelocity = touchScrollVelocity * 0.35 + instantVelocity * 0.65;
  touchDidScroll = true;
};

// Direction the stack peeks toward (bottom positions peek up, top positions peek down)
const stackDirection = computed<"up" | "down">(() =>
  props.position.includes("bottom") ? "up" : "down",
);

const listStyle = computed(() => ({
  width: isCenterAligned.value ? "100%" : undefined,
}));

const shouldUseSlots = (toast: any) => props.slotFilter?.(toast) ?? true;
const isSwipeToDismissEnabled = computed(() => props.swipeToDismiss !== false);
</script>

<template>
  <Teleport to="body">
    <div
      v-show="positionToasts.length > 0"
      ref="containerRef"
      class="soft-toast-container"
      :class="positionClass"
      :style="{ '--st-offset': typeof offset === 'number' ? `${offset}px` : offset }"
      :data-position="position"
      :data-soft-toast-theme="theme"
      :data-soft-toast-motion="motion"
      :data-soft-toast-dir="dir"
      :data-expanded="isExpanded"
    >
      <div
        ref="stackRef"
        class="soft-toast-stack"
        :data-direction="stackDirection"
        @mouseenter="handleStackEnter"
        @mouseleave="handleStackLeave"
        @touchstart.stop="handleStackTouchStart"
        @touchend.stop="handleStackTouchEnd"
        @wheel="handleWheel"
        data-lenis-prevent="true"
      >
        <div ref="listRef" class="soft-toast-list" :style="listStyle">
          <template v-for="(toast, idx) in renderedToasts" :key="toast.id">
            <ToastItem
              v-if="shouldUseSlots(toast)"
              :default-classes="toastOptions?.classNames"
              :toast="toast"
              :index="getVisualIndex(toast, idx)"
              :total="activeToasts.length"
              :expanded="isExpanded"
              :expanded-offset="expandedOffsets[toast.id] ?? 0"
              :stack-direction="stackDirection"
              :interactive="
                !toast.isLeaving && (isExpanded || getVisualIndex(toast, idx) === 0)
              "
              :close-button="toast.closeButton ?? closeButton"
              :swipe-to-dismiss="isSwipeToDismissEnabled"
              :style="
                isCenterAligned
                  ? { left: '50%', marginLeft: '-50%' }
                  : undefined
              "
            >
              <template v-for="(_, name) in $slots" #[name]="slotProps">
                <slot :name="name" v-bind="slotProps || {}" />
              </template>
            </ToastItem>

            <ToastItem
              v-else
              :default-classes="toastOptions?.classNames"
              :toast="toast"
              :index="getVisualIndex(toast, idx)"
              :total="activeToasts.length"
              :expanded="isExpanded"
              :expanded-offset="expandedOffsets[toast.id] ?? 0"
              :stack-direction="stackDirection"
              :interactive="
                !toast.isLeaving && (isExpanded || getVisualIndex(toast, idx) === 0)
              "
              :close-button="toast.closeButton ?? closeButton"
              :swipe-to-dismiss="isSwipeToDismissEnabled"
              :style="
                isCenterAligned
                  ? { left: '50%', marginLeft: '-50%' }
                  : undefined
              "
            />
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.soft-toast-stack {
  position: relative;
  pointer-events: auto;
  /* Generous padding ensures hover states don't flicker */
  padding-top: 32px;
  padding-bottom: 32px;
  margin-top: -32px;
  margin-bottom: -32px;
  width: 100%;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  /* No 300ms tap delay on iOS */
  touch-action: manipulation;
  /* NO overflow constraints here to prevent shadow clipping. 
     GSAP translation handles scrolling visually without clipping! */
}

.soft-toast-container[data-expanded="true"] .soft-toast-stack {
  touch-action: none;
}

.soft-toast-list {
  position: relative;
  width: 100%;
  flex-shrink: 0;
}

/* Align list to bottom when stack peeks UP */
.soft-toast-stack[data-direction="up"] .soft-toast-list {
  margin-top: auto;
}

/* Align list to top when stack peeks DOWN */
.soft-toast-stack[data-direction="down"] .soft-toast-list {
  margin-bottom: auto;
}

/* All toasts are absolutely positioned within the list.
   GSAP drives their y-position based on stack index and expanded state. */
.soft-toast-list > :deep(.soft-toast-item) {
  position: absolute;
  width: 100%;
}

/* Horizontal alignment based on container position */
.soft-toast-container[data-position$="left"]
  .soft-toast-list
  > :deep(.soft-toast-item) {
  left: 0;
  right: auto;
}
.soft-toast-container[data-position$="right"]
  .soft-toast-list
  > :deep(.soft-toast-item) {
  right: 0;
  left: auto;
}
/* Bottom-anchored stacks (top positions peek down): items anchored to top edge */
.soft-toast-stack[data-direction="down"]
  :deep(.soft-toast-list > .soft-toast-item) {
  top: 0;
  bottom: auto;
}
/* Top-anchored stacks (bottom positions peek up): items anchored to bottom edge */
.soft-toast-stack[data-direction="up"]
  :deep(.soft-toast-list > .soft-toast-item) {
  top: auto;
  bottom: 0;
}
</style>
