<script setup lang="ts">
import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  watch,
  nextTick,
  defineComponent,
} from "vue";
import type { Toast } from "../types";
import { toastStore } from "../stores/toastStore";
import { Icon } from "@iconify/vue";
import ToastIcon from "./ToastIcon.vue";
import ToastProgress from "./ToastProgress.vue";
import { registerToastIcons } from "../icons";
import {
  landingAnimation,
  exitAnimation,
  positionAnimation,
  killAnimations,
  swipeExitAnimation,
} from "../animations/gsapConfig";
import { gsap } from "gsap";

registerToastIcons();

interface Props {
  toast: Toast;
  closeButton?: boolean | "top-left" | "top-right";
  swipeToDismiss?: boolean;
  index?: number;
  total?: number;
  expanded?: boolean;
  expandedOffset?: number;
  stackDirection?: "up" | "down";
  reposition?: boolean;
  interactive?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  closeButton: false,
  swipeToDismiss: true,
  index: 0,
  total: 1,
  expanded: false,
  expandedOffset: 0,
  stackDirection: "up",
  reposition: false,
  interactive: true,
});

const toastRef = ref<HTMLElement | null>(null);
const hasActionSucceeded = ref(false);
const successLabelStr = ref("");
let isDismissing = false;

const formattedTime = computed(() => {
  const date = new Date(props.toast.createdAt);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
});

const isSwipeToDismissEnabled = computed(() => props.swipeToDismiss !== false);

// ─── Dismiss ────────────────────────────────────────────────────────────────

const dismiss = () => {
  if (isDismissing || !toastRef.value) return;
  const toastId = props.toast.id;
  const wasLeaving = props.toast.isLeaving;
  isDismissing = true;
  props.toast.isLeaving = true;
  if (!wasLeaving) props.toast.onDismiss?.(toastId);
  if (removeFallbackId !== null) {
    window.clearTimeout(removeFallbackId);
  }
  removeFallbackId = window.setTimeout(() => {
    toastStore.remove(toastId);
    removeFallbackId = null;
  }, 320);
  exitAnimation(toastRef.value);
};

// ─── Action buttons ──────────────────────────────────────────────────────────

const handleAction = async (act: any) => {
  if (!act) return;
  try {
    await act.onClick();
    if (act.successLabel) {
      hasActionSucceeded.value = true;
      successLabelStr.value = act.successLabel;
      setTimeout(dismiss, 1200);
    }
  } catch {
    /* keep open on error */
  }
};

const normalizedActions = computed(() => {
  if (!props.toast.action) return [];
  return Array.isArray(props.toast.action)
    ? props.toast.action
    : [props.toast.action];
});

const customToastProps = computed(() => ({
  ...(props.toast.props ?? {}),
  toast: props.toast,
  dismiss,
  execute: handleAction,
  hasSucceeded: hasActionSucceeded.value,
}));

const customRenderComponent = computed(() => {
  if (!props.toast.render) return null;
  return defineComponent({
    name: "SoftToastRenderContent",
    setup: () => () =>
      props.toast.render?.({
        toast: props.toast,
        dismiss,
        execute: handleAction,
        hasSucceeded: hasActionSucceeded.value,
      }),
  });
});

// ─── Stack position via GSAP ─────────────────────────────────────────────────

const applyStackPosition = (
  reposition = false,
  overrideOffset?: number,
  resetSwipe = false,
) => {
  if (!toastRef.value || props.toast.isLeaving || isSwiping) return;
  positionAnimation(toastRef.value, {
    index: props.index,
    expanded: props.expanded,
    preset: props.toast.preset,
    bounce: props.toast.bounce,
    spring: props.toast.spring,
    direction: props.stackDirection,
    expandedOffset: overrideOffset ?? props.expandedOffset,
    reposition,
    resetSwipe,
  });
};

// ─── Swipe-to-dismiss ────────────────────────────────────────────────────────
// Uses Pointer Events API — works with both touch and mouse.
// Spring physics:
//   - Tracks gesture in real-time via GSAP.set
//   - Velocity threshold: 500 px/s  OR  35% of toast width
//   - Hit threshold  → fly-off animation → dismiss
//   - Miss threshold → elastic snap-back spring

let swipeStartX = 0;
let swipeStartY = 0;
let swipeStartTime = 0;
let isSwiping = false;
let directionLocked = false;
let swipeCurrentX = 0;
let activePointerId: number | null = null;
let activePointerTarget: HTMLElement | null = null;
let lostCaptureFallbackId: number | null = null;
let removeFallbackId: number | null = null;

const clearLostCaptureFallback = () => {
  if (lostCaptureFallbackId === null) return;
  window.clearTimeout(lostCaptureFallbackId);
  lostCaptureFallbackId = null;
};

const releaseActivePointer = () => {
  if (activePointerId === null || !activePointerTarget) return;
  try {
    if (activePointerTarget.hasPointerCapture(activePointerId)) {
      activePointerTarget.releasePointerCapture(activePointerId);
    }
  } catch {
    // Safari can throw if capture was already lost during touch handoff.
  }
};

const removeSwipeFallbackListeners = () => {
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerup", handlePointerUp);
  window.removeEventListener("pointercancel", handlePointerCancel);
};

const resetSwipeTracking = () => {
  isSwiping = false;
  directionLocked = false;
  clearLostCaptureFallback();
  releaseActivePointer();
  removeSwipeFallbackListeners();
  activePointerId = null;
  activePointerTarget = null;
};

const snapBackSwipe = () => {
  if (!toastRef.value) return;
  if (!props.expanded) toastStore.resume(props.toast.id);
  applyStackPosition(true, undefined, true);
};

const completeSwipe = () => {
  if (!toastRef.value) return;

  const dx = swipeCurrentX;
  const elapsed = Math.max(1, Date.now() - swipeStartTime);
  const velocity = (Math.abs(dx) / elapsed) * 1000; // px/s
  const width = toastRef.value.offsetWidth;
  const threshold = width * 0.35;
  resetSwipeTracking();

  if (Math.abs(dx) >= threshold || velocity >= 500) {
    // --- Dismiss: fly off in swipe direction ---
    isDismissing = true;
    const toastId = props.toast.id;
    props.toast.isLeaving = true;
    if (removeFallbackId !== null) {
      window.clearTimeout(removeFallbackId);
    }
    removeFallbackId = window.setTimeout(() => {
      toastStore.remove(toastId);
      removeFallbackId = null;
    }, 320);
    const flyX = dx > 0 ? width * 1.6 : -width * 1.6;
    swipeExitAnimation(toastRef.value, flyX);
  } else {
    // --- Snap back with spring ---
    snapBackSwipe();
  }
};

const handlePointerDown = (e: PointerEvent) => {
  // Guard: isSwiping can be left true if lostpointercapture fired but its
  // 300 ms fallback hasn't resolved yet. If there is no active captured
  // pointer any more, reset the stale state so the next gesture isn't blocked.
  if (isSwiping && activePointerId !== null) {
    try {
      const el = activePointerTarget ?? (e.currentTarget as HTMLElement);
      if (!el.hasPointerCapture(activePointerId)) {
        resetSwipeTracking();
        snapBackSwipe();
      }
    } catch {
      resetSwipeTracking();
    }
  }
  if (
    !isSwipeToDismissEnabled.value ||
    isDismissing ||
    isSwiping ||
    props.toast.isLeaving
  ) {
    return;
  }
  // Only primary button for mouse; all pointers for touch/stylus
  if (e.pointerType === "mouse" && e.button !== 0) return;
  // Ignore if target is a button/link (don't hijack action clicks)
  const target = e.target as HTMLElement;
  if (target.closest("button, a")) return;

  swipeStartX = e.clientX;
  swipeStartY = e.clientY;
  swipeStartTime = Date.now();
  isSwiping = true;
  directionLocked = false;
  swipeCurrentX = 0;
  activePointerId = e.pointerId;
  activePointerTarget = e.currentTarget as HTMLElement;
  gsap.killTweensOf(toastRef.value);

  // Capture pointer so move/up fire even if cursor leaves the element
  try {
    activePointerTarget.setPointerCapture(e.pointerId);
  } catch {
    // Some WebKit touch paths may decline capture; window fallbacks still finish the gesture.
  }
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("pointercancel", handlePointerCancel);

  // Pause timer while swiping
  toastStore.pause(props.toast.id);
};

const handlePointerMove = (e: PointerEvent) => {
  if (!isSwiping || !toastRef.value) return;
  if (activePointerId !== null && e.pointerId !== activePointerId) return;
  clearLostCaptureFallback();

  const dx = e.clientX - swipeStartX;
  const dy = e.clientY - swipeStartY;

  // Direction lock: first significant movement decides swipe vs scroll
  if (!directionLocked) {
    if (Math.abs(dy) > Math.abs(dx) + 4) {
      // Vertical gesture — cancel swipe, let browser scroll
      resetSwipeTracking();
      snapBackSwipe();
      return;
    }
    if (Math.abs(dx) > Math.abs(dy) + 4) {
      directionLocked = true;
    } else {
      return; // not enough movement yet
    }
  }

  e.preventDefault();
  swipeCurrentX = dx;

  // Clamp opacity: full at 0, gone at 70% of width
  const width = toastRef.value.offsetWidth;
  const opacity = Math.max(0, 1 - Math.abs(dx) / (width * 0.7));
  // Slight vertical tilt for realism
  const rotate = (dx / width) * 6; // max ±6deg

  gsap.set(toastRef.value, { x: dx, opacity, rotate, overwrite: "auto" });
};

const handlePointerUp = (e: PointerEvent) => {
  if (!isSwiping || !toastRef.value) return;
  if (activePointerId !== null && e.pointerId !== activePointerId) return;

  completeSwipe();
};

const handlePointerCancel = (e?: PointerEvent) => {
  if (!isSwiping || !toastRef.value) return;
  if (e && activePointerId !== null && e.pointerId !== activePointerId) return;
  resetSwipeTracking();
  snapBackSwipe();
};

const handleLostPointerCapture = (e: PointerEvent) => {
  if (!isSwiping || !toastRef.value) return;
  if (activePointerId !== null && e.pointerId !== activePointerId) return;
  activePointerTarget = null;
  clearLostCaptureFallback();
  lostCaptureFallbackId = window.setTimeout(() => {
    if (!isSwiping) return;
    resetSwipeTracking();
    snapBackSwipe();
  }, 150);
};

const handleVisibilityChange = () => {
  if (document.hidden && isSwiping) {
    resetSwipeTracking();
    snapBackSwipe();
  }
};

// ─── Lifecycle ───────────────────────────────────────────────────────────────

onMounted(() => {
  document.addEventListener("visibilitychange", handleVisibilityChange);
  if (!toastRef.value) return;
  const isBottom = props.toast.position.includes("bottom");
  const tl = landingAnimation(toastRef.value, {
    preset: props.toast.preset,
    bounce: props.toast.bounce,
    spring: props.toast.spring,
    direction: isBottom ? "up" : "down",
  });
  tl.eventCallback("onComplete", () => {
    nextTick(applyStackPosition);
  });
});

// Split the watches so a dismiss only creates one restack animation.
// Collapsed stacks move by index; expanded stacks move by measured offsets.
watch(
  () => props.index,
  (newIndex, oldIndex) => {
    if (props.expanded) return;
    applyStackPosition(newIndex < oldIndex || props.reposition);
  },
);

watch(
  () => props.expandedOffset,
  (newOffset, oldOffset) => {
    if (!props.expanded) return;
    applyStackPosition(newOffset !== oldOffset);
  },
);

watch(
  () => props.expanded,
  (expanded) => {
    if (!expanded) {
      // Collapse: animate immediately back to stacked position
      applyStackPosition(true);
    }
    // Expand: ToastRegion calls applyStackPosition directly after measuring
  },
);

watch(
  () => props.expanded,
  (expanded) => {
    if (expanded) toastStore.pause(props.toast.id);
    else if (!isSwiping && !props.toast.isLeaving) {
      toastStore.resume(props.toast.id);
    }
  },
);

watch(
  () => props.toast.isLeaving,
  (leaving) => {
    if (leaving) {
      if (isSwiping) resetSwipeTracking();
      dismiss();
    }
  },
);

defineExpose({ applyStackPosition });

onUnmounted(() => {
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  if (isSwiping) {
    resetSwipeTracking();
    toastStore.resume(props.toast.id);
  }
  if (removeFallbackId !== null) {
    window.clearTimeout(removeFallbackId);
    removeFallbackId = null;
  }
  if (toastRef.value) killAnimations(toastRef.value);
});
</script>

<template>
  <div
    ref="toastRef"
    class="soft-toast-item"
    :class="{ 'soft-toast-item--swipeable': isSwipeToDismissEnabled }"
    :data-type="toast.type"
    :data-st-index="index"
    :data-toast-id="toast.id"
    :data-leaving="toast.isLeaving"
    :data-interactive="interactive"
    :style="{ zIndex: 1000 - index }"
    @pointerdown="handlePointerDown"
    @pointercancel="handlePointerCancel"
    @lostpointercapture="handleLostPointerCapture"
  >
    <slot
      name="close-button"
      :toast="toast"
      :dismiss="dismiss"
      :close-button="closeButton"
    >
      <button
        v-if="closeButton"
        class="soft-toast-close"
        :data-position="
          typeof closeButton === 'string' ? closeButton : 'top-right'
        "
        @click.stop="dismiss"
        aria-label="Close"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          class="st-close-icon"
        >
          <path
            class="st-close-line-1"
            d="M1 1L9 9"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
          <path
            class="st-close-line-2"
            d="M9 1L1 9"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </slot>

    <div class="soft-toast-content">
      <div
        v-if="toast.component || customRenderComponent"
        class="soft-toast-custom-content"
      >
        <component
          v-if="toast.component"
          :is="toast.component"
          v-bind="customToastProps"
        />
        <component v-else-if="customRenderComponent" :is="customRenderComponent" />
      </div>

      <template v-else>
      <slot name="icon" :toast="toast" :close-button="closeButton">
        <div v-if="toast.type === 'promise'" class="soft-toast-icon">
          <Icon
            class="soft-toast-icon-svg"
            icon="lucide:loader-circle"
            :width="18"
            :height="18"
          />
        </div>
        <ToastIcon
          v-else-if="toast.icon && typeof toast.icon === 'string'"
          :type="toast.type"
          :customIcon="toast.icon"
        />
        <div v-else-if="toast.icon" class="soft-toast-icon">
          <component :is="toast.icon" />
        </div>
        <ToastIcon v-else-if="toast.type !== 'default'" :type="toast.type" />
      </slot>

      <div class="soft-toast-body">
        <div class="soft-toast-header-row">
          <slot name="title" :toast="toast" :close-button="closeButton">
            <p
              class="soft-toast-title"
              :class="{
                'soft-toast-title--has-close':
                  closeButton === true || closeButton === 'top-right',
              }"
            >
              {{ toast.title }}
            </p>
          </slot>
        </div>

        <div
          v-if="toast.description || toast.action"
          class="soft-toast-extra"
          style="overflow: hidden"
        >
          <slot name="description" :toast="toast" :close-button="closeButton">
            <p v-if="toast.description" class="soft-toast-description">
              <component
                v-if="typeof toast.description === 'object'"
                :is="toast.description"
              />
              <template v-else>{{ toast.description }}</template>
            </p>
          </slot>

          <slot
            name="action"
            :toast="toast"
            :execute="handleAction"
            :hasSucceeded="hasActionSucceeded"
            :close-button="closeButton"
          >
            <div
              v-if="normalizedActions.length > 0 && !hasActionSucceeded"
              class="soft-toast-action"
            >
              <button
                v-for="(act, idx) in normalizedActions"
                :key="idx"
                class="soft-toast-action-button"
                :class="[
                  act.class || '',
                  act.primary ? 'soft-toast-action-primary' : '',
                ]"
                @click.stop="() => handleAction(act)"
              >
                {{ act.label }}
              </button>
            </div>
            <div v-else-if="hasActionSucceeded" class="soft-toast-action">
              <span
                class="soft-toast-action-button soft-toast-action-success"
                style="opacity: 0.75; cursor: default"
              >
                {{ successLabelStr }}
              </span>
            </div>
          </slot>
        </div>

        <!-- Timestamp lives below all content — never overlaps close button -->
        <span v-if="toast.showTimestamp" class="soft-toast-timestamp">
          {{ formattedTime }}
        </span>
      </div>
      </template>
    </div>

    <ToastProgress
      v-if="
        toast.showProgress && toast.duration > 0 && toast.duration !== Infinity
      "
      :remaining-time="toast.remainingTime"
      :total-duration="toast.duration"
      :is-paused="toast.isPaused"
    />
  </div>
</template>
