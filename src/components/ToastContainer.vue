<script setup lang="ts">
import { computed, inject, watchEffect, onMounted, onUnmounted, watch } from "vue";
import type {
  ToastContainerProps,
  Toast,
  ToastAction,
} from "../types";
import ToastRegion from "./ToastRegion.vue";
import { toastStore, setPageHidden, setToastDefaults } from "../stores/toastStore";

const props = withDefaults(defineProps<ToastContainerProps>(), {
  closeOnEscape: undefined,
  spring: undefined,
  showTimestamp: undefined,
  closeButton: undefined,
  showProgress: undefined,
  sound: undefined,
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

const positions = computed(() => [...new Set(toastStore.toasts.value.map(t => t.position))]);

const installedOptions = inject<ToastContainerProps>("softToastDefaults", {});
watchEffect(() => {
  const overrides = Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined));
  setToastDefaults({ ...installedOptions, ...overrides });
});

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Escape" || event.defaultPrevented || event.repeat) return;
  if (!(props.closeOnEscape ?? installedOptions.closeOnEscape ?? true)) return;
  const latest = toastStore.toasts.value.find(toast => !toast.isLeaving);
  if (latest) {
    event.preventDefault();
    toastStore.dismiss(latest.id);
  }
};

const handleVisibilityChange = () => setPageHidden(document.hidden);
const handlePageHide = () => setPageHidden(true);

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
  handleVisibilityChange();
  document.addEventListener("keydown", handleKeydown);
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("pageshow", handleVisibilityChange);
  document.addEventListener("visibilitychange", handleVisibilityChange);
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("pagehide", handlePageHide);
  window.removeEventListener("pageshow", handleVisibilityChange);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
});
</script>

<template>
    <ToastRegion
      v-for="pos in positions"
      :key="pos"
      v-bind="props"
      :offset="props.offset ?? installedOptions.offset"
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
</template>
