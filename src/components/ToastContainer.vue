<script setup lang="ts">

import type { ToastContainerProps, ToastPosition } from "../types";
import ToastRegion from "./ToastRegion.vue";

const props = withDefaults(defineProps<ToastContainerProps>(), {
  position: "top-right",
  maxQueue: 10,
  queueOverflow: "drop-oldest",
  swipeToDismiss: true,
});

const positions: ToastPosition[] = [
  "top", "bottom", "left", "right",
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
      :position="pos"
    >
      <template v-for="(_, name) in $slots" #[name]="slotProps">
        <slot :name="name" v-bind="slotProps || {}" />
      </template>
    </ToastRegion>
  </Teleport>
</template>
