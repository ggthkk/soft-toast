<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import type { ToastContainerProps } from "../types";
import { toastStore } from "../stores/toastStore";
import ToastItem from "./ToastItem.vue";
import { gsap } from "gsap";

// Props with defaults
const props = withDefaults(defineProps<ToastContainerProps>(), {
  position: "top-right",
  duration: 5000,
  gap: 12,
  offset: "24px",
  theme: "light",
  spring: true,
  bounce: 0.4,
  preset: "smooth",
  closeOnEscape: true,
  closeButton: false,
  showProgress: false,
  showTimestamp: false,
  maxQueue: Infinity,
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

// Handle keyboard (Escape to dismiss most recent)
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === "Escape" && props.closeOnEscape) {
    const toasts = positionToasts.value;
    if (toasts.length > 0) {
      toastStore.dismiss(toasts[0].id);
    }
  }
};

// Pause all timers when tab is hidden, resume when visible again
const handleVisibilityChange = () => {
  const toasts = positionToasts.value;
  if (document.hidden) {
    toasts.forEach((t) => toastStore.pause(t.id));
  } else {
    toasts.forEach((t) => toastStore.resume(t.id));
  }
};

onMounted(() => {
  if (props.closeOnEscape) {
    document.addEventListener("keydown", handleKeydown);
  }

  // Pause all timers when user switches tab / window loses focus
  document.addEventListener("visibilitychange", handleVisibilityChange);

  if (listRef.value && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => measureOffsets());
    resizeObserver.observe(listRef.value);
  }
});

onUnmounted(() => {
  if (props.closeOnEscape) {
    document.removeEventListener("keydown", handleKeydown);
  }
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  if (resizeObserver) resizeObserver.disconnect();
});

// Re-measure when toast list changes or when a toast starts leaving
watch(
  () => positionToasts.value.map((t) => `${t.id}:${t.isLeaving}`).join(","),
  () => {
    nextTick(measureOffsets);
  },
);

// Apply default options to new toasts
watch(
  () => toastStore.toasts.value.length,
  (newLength, oldLength) => {
    if (newLength > oldLength) {
      // New toast added, apply container-level defaults
      const newToast = toastStore.toasts.value[0];
      if (newToast) {
        if (!newToast.duration) newToast.duration = props.duration;
        if (!newToast.preset) newToast.preset = props.preset;
        if (newToast.bounce === undefined) newToast.bounce = props.bounce;
        if (newToast.spring === undefined) newToast.spring = props.spring;
        if (newToast.showProgress === undefined)
          newToast.showProgress = props.showProgress;
        // Only apply container showTimestamp if the toast didn't explicitly set it
        if (newToast.showTimestamp === undefined)
          newToast.showTimestamp = props.showTimestamp;
      }
    }
  },
);

// Position classes
const positionClass = computed(() => `soft-toast-container--${props.position}`);

// Visual Indexing (ignore leaving toasts so the stack closes gaps instantly)
const activeToasts = computed(() =>
  positionToasts.value.filter((t) => !t.isLeaving),
);
const getVisualIndex = (toast: any, realIdx: number) => {
  if (toast.isLeaving) return realIdx; // Keep its place while animating out
  return activeToasts.value.findIndex((t) => t.id === toast.id);
};

// Stack expansion (hover or focus reveals the stack)
const isExpanded = ref(false);

// Measured cumulative offsets for each item when stack is expanded.
const expandedOffsets = ref<number[]>([]);
const frontHeight = ref(0);
const totalHeight = ref(0);

const measureOffsets = () => {
  if (!listRef.value) return;
  const items = Array.from(
    listRef.value.querySelectorAll<HTMLElement>(".soft-toast-item"),
  );
  const gapPx = props.gap ?? 10;
  const offsets: number[] = [];
  let cumulative = 0;
  let firstActiveHeight = 0;
  
  for (let i = 0; i < items.length; i++) {
    offsets.push(cumulative);
    
    // Only accumulate height if the toast is not leaving
    if (items[i].getAttribute("data-leaving") !== "true") {
      cumulative += items[i].offsetHeight + gapPx;
      // The front toast is the one that has visual index 0
      const toastId = items[i].dataset.toastId;
      const t = positionToasts.value.find(x => x.id === toastId);
      if (t) {
        const vIdx = getVisualIndex(t, positionToasts.value.indexOf(t));
        if (vIdx === 0) {
          firstActiveHeight = items[i].offsetHeight;
        }
      }
    }
  }
  
  expandedOffsets.value = offsets;
  frontHeight.value = firstActiveHeight;
  totalHeight.value = Math.max(0, cumulative - gapPx);
  
  // Re-clamp scroll if height changes while expanded
  if (isExpanded.value && listRef.value) {
    clampAndApplyScroll(0); // Applies bounds check without adding new delta
  }
};

// Custom GSAP Scrolling
const currentScrollY = ref(0);

const clampAndApplyScroll = (deltaY: number) => {
  if (!listRef.value) return;
  
  // Viewport padding buffer
  const buffer = 120; 
  const windowHeight = window.innerHeight;
  
  // We only need to scroll if the total stack height exceeds the viewport
  const maxScrollNeeded = Math.max(0, totalHeight.value - windowHeight + buffer);
  
  if (stackDirection.value === "up") {
    // Stack builds upwards (y goes negative). 
    // To see higher items, we scroll UP (deltaY < 0), so we translate DOWN (y goes positive).
    currentScrollY.value -= deltaY;
    currentScrollY.value = Math.max(0, Math.min(currentScrollY.value, maxScrollNeeded));
  } else {
    // Stack builds downwards (y goes positive).
    // To see lower items, we scroll DOWN (deltaY > 0), so we translate UP (y goes negative).
    currentScrollY.value -= deltaY;
    currentScrollY.value = Math.max(-maxScrollNeeded, Math.min(currentScrollY.value, 0));
  }
  
  gsap.to(listRef.value, {
    y: currentScrollY.value,
    duration: 0.4,
    ease: "power3.out",
    overwrite: "auto"
  });
};

const handleWheel = (e: WheelEvent) => {
  if (!isExpanded.value) return;
  
  // Check if the scroll originated from inside a scrollable element (like a long description)
  let target = e.target as HTMLElement | null;
  let isInternalScroll = false;
  
  while (target && target !== stackRef.value) {
    const style = window.getComputedStyle(target);
    const overflowY = style.overflowY;
    
    // Check if the element is capable of vertical scrolling
    if (overflowY === "auto" || overflowY === "scroll") {
      // It is a scrollable container. Check if it actually has overflow
      if (target.scrollHeight > target.clientHeight) {
        // Check if we can scroll in the direction of the wheel
        // (deltaY > 0 is scrolling down, deltaY < 0 is scrolling up)
        const canScrollDown = Math.ceil(target.scrollTop + target.clientHeight) < target.scrollHeight;
        const canScrollUp = target.scrollTop > 0;
        
        if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
          isInternalScroll = true;
          break; // It's a valid internal scroll, stop checking parents
        }
      }
    }
    target = target.parentElement;
  }
  
  if (isInternalScroll) {
    // Don't intercept the wheel event; let the internal scrollbar handle it
    return;
  }

  // If we don't need to scroll the main stack, don't prevent default so page can scroll normally
  const maxScrollNeeded = Math.max(0, totalHeight.value - window.innerHeight + 120);
  if (maxScrollNeeded <= 0) return;
  
  e.preventDefault();
  clampAndApplyScroll(e.deltaY);
};

// Dynamic list height: just the front toast when collapsed, full stack when expanded.
const listHeightPx = computed(() => {
  if (positionToasts.value.length === 0) return 0;
  return isExpanded.value ? totalHeight.value : frontHeight.value;
});

let resizeObserver: ResizeObserver | null = null;
const handleStackEnter = () => {
  measureOffsets();
  isExpanded.value = true;
};
const handleStackLeave = () => {
  isExpanded.value = false;
  // Reset GSAP scroll when mouse leaves
  currentScrollY.value = 0;
  if (listRef.value) {
    gsap.to(listRef.value, { y: 0, duration: 0.5, ease: "power3.out", overwrite: "auto" });
  }
};

// Direction the stack peeks toward (bottom positions peek up, top positions peek down)
const stackDirection = computed<"up" | "down">(() =>
  props.position.includes("bottom") ? "up" : "down",
);
</script>

<template>
  <Teleport to="body">
    <div
      v-show="positionToasts.length > 0"
      ref="containerRef"
      class="soft-toast-container"
      :class="positionClass"
      :data-position="position"
      :data-soft-toast-theme="theme"
      :data-soft-toast-dir="dir"
      :data-expanded="isExpanded"
    >
      <div
        ref="stackRef"
        class="soft-toast-stack"
        :data-direction="stackDirection"
        @mouseenter="handleStackEnter"
        @mouseleave="handleStackLeave"
        @wheel="handleWheel"
        data-lenis-prevent="true"
      >
        <div
          ref="listRef"
          class="soft-toast-list"
          :style="{ height: listHeightPx + 'px' }"
        >
          <ToastItem
            v-for="(toast, idx) in positionToasts"
            :key="toast.id"
            :toast="toast"
            :index="getVisualIndex(toast, idx)"
            :total="activeToasts.length"
            :expanded="isExpanded"
            :expanded-offset="expandedOffsets[idx] ?? 0"
            :stack-direction="stackDirection"
            :close-button="toast.closeButton ?? closeButton"
            :swipe-to-dismiss="swipeToDismiss"
          >
            <template v-for="(_, name) in $slots" #[name]="slotProps">
              <slot :name="name" v-bind="slotProps || {}" />
            </template>
          </ToastItem>
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
  /* NO overflow constraints here to prevent shadow clipping. 
     GSAP translation handles scrolling visually without clipping! */
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
.soft-toast-container[data-position$="left"] .soft-toast-list > :deep(.soft-toast-item) {
  left: 0;
  right: auto;
}
.soft-toast-container[data-position$="right"] .soft-toast-list > :deep(.soft-toast-item) {
  right: 0;
  left: auto;
}
.soft-toast-container[data-position$="center"] .soft-toast-list > :deep(.soft-toast-item) {
  left: 50%;
  transform: translateX(-50%); /* Base horizontal centering before GSAP adds translateY */
}

/* Bottom-anchored stacks (top positions peek down): items anchored to top edge */
.soft-toast-stack[data-direction="down"] :deep(.soft-toast-list > .soft-toast-item) {
  top: 0;
  bottom: auto;
}
/* Top-anchored stacks (bottom positions peek up): items anchored to bottom edge */
.soft-toast-stack[data-direction="up"] :deep(.soft-toast-list > .soft-toast-item) {
  top: auto;
  bottom: 0;
}
</style>
