<script setup lang="ts">
import { Icon } from '@iconify/vue';
import type { ToastType } from "../types";
import { registerToastIcons } from "../icons";

registerToastIcons();

interface Props {
  type: ToastType;
  customIcon?: string;
}

const props = defineProps<Props>();

const defaultIcons: Record<string, string> = {
  success: 'lucide:circle-check',
  error: 'lucide:circle-x',
  warning: 'lucide:triangle-alert',
  info: 'lucide:info',
  default: 'lucide:bell',
};

const getIcon = () => {
  if (props.customIcon) return props.customIcon;
  return defaultIcons[props.type] || defaultIcons.default;
};
</script>

<template>
  <span class="soft-toast-icon">
    <Icon class="soft-toast-icon-svg" :icon="getIcon()" :width="18" :height="18" />
  </span>
</template>
