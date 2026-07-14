<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";
import type {
  ToastContainerProps,
  ToastPosition,
  Toast,
  ToastAction,
} from "../types";
import ToastRegion from "./ToastRegion.vue";
import { toastStore } from "../stores/toastStore";

const props = withDefaults(defineProps<ToastContainerProps>(), {
  position: "top-right",
  maxQueue: 10,
  queueOverflow: "drop-oldest",
  swipeToDismiss: true,
});

defineSlots<{
  icon(props: {
    toast: Toast;
    closeButton: boolean | "top-left" | "top-right";
  }): unknown;
  title(props: {
    toast: Toast;
    closeButton: boolean | "top-left" | "top-right";
  }): unknown;
  description(props: {
    toast: Toast;
    closeButton: boolean | "top-left" | "top-right";
  }): unknown;
  action(props: {
    toast: Toast;
    execute: (action: ToastAction) => void | Promise<void>;
    hasSucceeded: boolean;
    closeButton: boolean | "top-left" | "top-right";
  }): unknown;
  "close-button"(props: {
    toast: Toast;
    dismiss: () => void;
    closeButton: boolean | "top-left" | "top-right";
  }): unknown;
}>();

const positions: ToastPosition[] = [
  "top",
  "bottom",
  "left",
  "right",
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

// Pause/resume every toast timer (across ALL positions) from a single
// listener instead of one per ToastRegion instance (10x fewer listeners).
const handleVisibilityChange = () => {
  const all = toastStore.toasts.value;
  if (document.hidden) {
    all.forEach((t) => toastStore.pause(t.id));
  } else {
    all.forEach((t) => toastStore.resume(t.id));
  }
};

// Sync the queue cap + default sound volume ONCE here. Without this, each
// of the 10 Region instances would call setMaxQueue() on mount and on every
// prop change — redundant work plus a transient state where the cap flips
// through 10 different values.
watch(
  () => [props.maxQueue, props.queueOverflow, props.soundVolume] as const,
  ([max, overflow, vol]) => {
    toastStore.setMaxQueue(max ?? Infinity, overflow ?? "drop-oldest");
    if (vol !== undefined) toastStore.setDefaultSoundVolume(vol);
  },
  { immediate: true },
);

onMounted(() => {
  document.addEventListener("visibilitychange", handleVisibilityChange);
});

onUnmounted(() => {
  document.removeEventListener("visibilitychange", handleVisibilityChange);
});
</script>

<template>
  <Teleport to="body">
    <ToastRegion
      v-for="pos in positions"
      :key="pos"
      v-bind="props"
      :position="pos">
      <template v-if="$slots.icon" #icon="slotProps">
        <slot name="icon" v-bind="slotProps" />
      </template>
      <template v-if="$slots.title" #title="slotProps">
        <slot name="title" v-bind="slotProps" />
      </template>
      <template v-if="$slots.description" #description="slotProps">
        <slot name="description" v-bind="slotProps" />
      </template>
      <template v-if="$slots.action" #action="slotProps">
        <slot name="action" v-bind="slotProps" />
      </template>
      <template v-if="$slots['close-button']" #close-button="slotProps">
        <slot name="close-button" v-bind="slotProps" />
      </template>
    </ToastRegion>
  </Teleport>
</template>
