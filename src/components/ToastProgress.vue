<script setup lang="ts">
import { ref, watch, onUnmounted, onMounted } from 'vue'
import { progressAnimation, pauseAnimation, resumeAnimation } from '../animations/gsapConfig'

interface Props {
  remainingTime: number
  totalDuration: number
  isPaused: boolean
}

const props = defineProps<Props>()

const progressRef = ref<HTMLElement | null>(null)
const animation = ref<gsap.core.Tween | null>(null)

// Initialize animation on mount
onMounted(() => {
  if (!progressRef.value) return
  
  animation.value = progressAnimation(
    progressRef.value,
    props.remainingTime,
  )
  
  if (props.isPaused) {
    pauseAnimation(animation.value)
  }
})

// Handle pause/resume
watch(() => props.isPaused, (isPaused) => {
  if (!animation.value) return
  
  if (isPaused) {
    pauseAnimation(animation.value)
  } else {
    resumeAnimation(animation.value)
  }
})

onUnmounted(() => {
  animation.value?.kill()
})
</script>

<template>
  <div class="soft-toast-progress">
    <div ref="progressRef" class="soft-toast-progress-bar" />
  </div>
</template>
