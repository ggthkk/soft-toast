<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import type { Toast } from '../types'
import { getRemainingTime } from '../stores/toastStore'
import { progressAnimation } from '../animations/gsapConfig'

const props = defineProps<{ toast: Toast }>()
const progressRef = ref<HTMLElement | null>(null)

watchEffect((onCleanup) => {
  const element = progressRef.value
  if (!element) return
  const toast = props.toast
  const remaining = getRemainingTime(toast)
  const tween = progressAnimation(element, toast.duration)
  tween.time((toast.duration - remaining) / 1000).paused(toast.isPaused)
  onCleanup(() => tween.kill())
})
</script>

<template>
  <div class="soft-toast-progress">
    <div ref="progressRef" class="soft-toast-progress-bar" />
  </div>
</template>
