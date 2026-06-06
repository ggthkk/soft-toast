<script setup lang="ts">
import type {
  ToastContainerProps,
  ToastPosition,
  Toast,
  ToastAction,
} from "../types";
import ToastRegion from "./ToastRegion.vue";

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
