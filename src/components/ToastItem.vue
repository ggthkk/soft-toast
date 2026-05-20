<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import type { Toast } from "../types";
import { toastStore } from "../stores/toastStore";
import { Icon } from '@iconify/vue';
import ToastIcon from "./ToastIcon.vue";
import ToastProgress from "./ToastProgress.vue";
import { registerToastIcons } from "../icons";
import {
  landingAnimation,
  exitAnimation,
  positionAnimation,
  killAnimations,
  swipeExitAnimation,
  swipeSnapBack,
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
});

const toastRef = ref<HTMLElement | null>(null);
const hasActionSucceeded = ref(false);
const successLabelStr = ref("");
let isDismissing = false;

const formattedTime = computed(() => {
  const date = new Date(props.toast.createdAt);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
});

// ─── Dismiss ────────────────────────────────────────────────────────────────

const dismiss = () => {
  if (isDismissing || !toastRef.value) return;
  isDismissing = true;
  props.toast.isLeaving = true;
  const tween = exitAnimation(toastRef.value);
  tween.then(() => toastStore.dismiss(props.toast.id));
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
  return Array.isArray(props.toast.action) ? props.toast.action : [props.toast.action];
});

// ─── Stack position via GSAP ─────────────────────────────────────────────────

const applyStackPosition = (reposition = false) => {
  if (!toastRef.value || props.toast.isLeaving) return;
  positionAnimation(toastRef.value, {
    index: props.index,
    expanded: props.expanded,
    preset: props.toast.preset,
    bounce: props.toast.bounce,
    spring: props.toast.spring,
    direction: props.stackDirection,
    expandedOffset: props.expandedOffset,
    reposition,
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
let swipeStartTime = 0;
let isSwiping = false;
let swipeCurrentX = 0;

const handlePointerDown = (e: PointerEvent) => {
  if (!props.swipeToDismiss || isDismissing) return;
  // Only primary button for mouse; all pointers for touch/stylus
  if (e.pointerType === "mouse" && e.button !== 0) return;
  // Ignore if target is a button/link (don't hijack action clicks)
  const target = e.target as HTMLElement;
  if (target.closest("button, a")) return;

  swipeStartX = e.clientX;
  swipeStartTime = Date.now();
  isSwiping = true;
  swipeCurrentX = 0;

  // Capture pointer so move/up fire even if cursor leaves the element
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

  // Pause timer while swiping
  toastStore.pause(props.toast.id);
};

const handlePointerMove = (e: PointerEvent) => {
  if (!isSwiping || !toastRef.value) return;

  const dx = e.clientX - swipeStartX;
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
  isSwiping = false;

  const dx = swipeCurrentX;
  const elapsed = Math.max(1, Date.now() - swipeStartTime);
  const velocity = (Math.abs(dx) / elapsed) * 1000; // px/s
  const width = toastRef.value.offsetWidth;
  const threshold = width * 0.35;

  if (Math.abs(dx) >= threshold || velocity >= 500) {
    // --- Dismiss: fly off in swipe direction ---
    isDismissing = true;
    props.toast.isLeaving = true;
    const flyX = dx > 0 ? width * 1.6 : -width * 1.6;
    swipeExitAnimation(toastRef.value, flyX).then(() => {
      toastStore.remove(props.toast.id);
    });
  } else {
    // --- Snap back with spring ---
    gsap.set(toastRef.value, { rotate: 0 }); // reset tilt first
    swipeSnapBack(toastRef.value);
    toastStore.resume(props.toast.id);
  }
};

const handlePointerCancel = () => {
  if (!isSwiping || !toastRef.value) return;
  isSwiping = false;
  gsap.set(toastRef.value, { rotate: 0 });
  swipeSnapBack(toastRef.value);
  toastStore.resume(props.toast.id);
};

// ─── Lifecycle ───────────────────────────────────────────────────────────────

onMounted(() => {
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
watch(() => props.index, (newIndex, oldIndex) => {
  if (props.expanded) return;
  applyStackPosition(newIndex < oldIndex || props.reposition);
})

watch(() => props.expandedOffset, (newOffset, oldOffset) => {
  if (!props.expanded) return;
  applyStackPosition(newOffset !== oldOffset);
})

watch(() => props.expanded, () => {
  applyStackPosition(true)
})

watch(
  () => props.expanded,
  (expanded) => {
    if (expanded) toastStore.pause(props.toast.id);
    else toastStore.resume(props.toast.id);
  },
);

watch(
  () => props.toast.isLeaving,
  (leaving) => { if (leaving) dismiss(); },
);

onUnmounted(() => {
  if (toastRef.value) killAnimations(toastRef.value);
});
</script>

<template>
  <div
    ref="toastRef"
    class="soft-toast-item"
    :class="{ 'soft-toast-item--swipeable': swipeToDismiss }"
    :data-type="toast.type"
    :data-st-index="index"
    :data-leaving="toast.isLeaving"
    :style="{ zIndex: 1000 - index }"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerCancel"
  >
    <slot name="close-button" :toast="toast" :dismiss="dismiss">
      <button
        v-if="closeButton"
        class="soft-toast-close"
        :data-position="
          typeof closeButton === 'string' ? closeButton : 'top-right'
        "
        @click.stop="dismiss"
        aria-label="Close"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" class="st-close-icon">
          <path class="st-close-line-1" d="M1 1L9 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <path class="st-close-line-2" d="M9 1L1 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </button>
    </slot>

    <div class="soft-toast-content">
      <slot name="icon" :toast="toast">
        <div v-if="toast.type === 'promise'" class="soft-toast-icon">
          <Icon
            class="soft-toast-icon-svg"
            icon="lucide:loader-circle"
            :width="18"
            :height="18"
          />
        </div>
        <ToastIcon v-else-if="toast.icon && typeof toast.icon === 'string'" :type="toast.type" :customIcon="toast.icon" />
        <div v-else-if="toast.icon" class="soft-toast-icon">
          <component :is="toast.icon" />
        </div>
        <ToastIcon v-else-if="toast.type !== 'default'" :type="toast.type" />
      </slot>

      <div class="soft-toast-body">
        <div class="soft-toast-header-row">
          <slot name="title" :toast="toast">
            <p
              class="soft-toast-title"
              :class="{ 'soft-toast-title--has-close': closeButton === true || closeButton === 'top-right' }"
            >{{ toast.title }}</p>
          </slot>
        </div>

        <div v-if="toast.description || toast.action" class="soft-toast-extra" style="overflow: hidden;">
          <slot name="description" :toast="toast">
            <p v-if="toast.description" class="soft-toast-description">
              <component
                v-if="typeof toast.description === 'object'"
                :is="toast.description"
              />
              <template v-else>{{ toast.description }}</template>
            </p>
          </slot>

          <slot name="action" :toast="toast" :execute="handleAction" :hasSucceeded="hasActionSucceeded">
            <div
              v-if="normalizedActions.length > 0 && !hasActionSucceeded"
              class="soft-toast-action"
            >
              <button
                v-for="(act, idx) in normalizedActions"
                :key="idx"
                class="soft-toast-action-button"
                :class="[act.class || '', act.primary ? 'soft-toast-action-primary' : '']"
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
    </div>

    <ToastProgress
      v-if="toast.showProgress && toast.duration > 0 && toast.duration !== Infinity"
      :remaining-time="toast.remainingTime"
      :total-duration="toast.duration"
      :is-paused="toast.isPaused"
    />
  </div>
</template>
