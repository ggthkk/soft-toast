// Main exports
export { SoftToastPlugin, getToastOptions } from './plugin'
export { useSoftToast, softToast } from './composables/useSoftToast'
export { useFlash, queueFlash, consumeFlashes, hasPendingFlashes } from './composables/useFlash'
export { toastStore } from './stores/toastStore'

// Components
export { default as ToastContainer } from './components/ToastContainer.vue'
export { default as ToastItem } from './components/ToastItem.vue'

// Types
export type {
  Toast,
  ToastType,
  ToastPosition,
  ToastOptions,
  ToastRenderContext,
  ToastAction,
  ToastPromiseMessages,
  ToastClassNames,
  ToastContainerProps,
  ToastPluginOptions,
  AnimationPreset,
  QueueOverflow
} from './types'
