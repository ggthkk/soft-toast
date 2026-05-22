import type { VNode, Component } from 'vue'

export type ToastType = 'default' | 'success' | 'error' | 'warning' | 'info' | 'promise'
export type ToastPosition = 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
export type AnimationPreset = 'smooth' | 'bouncy' | 'subtle' | 'snappy'
export type QueueOverflow = 'drop-oldest' | 'drop-newest'

export interface ToastAction {
  label: string
  onClick: () => void | Promise<void>
  successLabel?: string
  primary?: boolean
  class?: string
}

export interface ToastPromiseMessages<T = unknown> {
  loading: string
  success: string | ((data: T) => string)
  error: string | ((err: unknown) => string)
  description?: {
    success?: string | ((data: T) => string)
    error?: string | ((err: unknown) => string)
  }
  action?: {
    error?: ToastAction
  }
}

export interface ToastOptions {
  id?: string
  type?: ToastType
  title?: string
  description?: string | VNode
  action?: ToastAction | ToastAction[]
  icon?: string | VNode | Component
  duration?: number
  position?: ToastPosition
  classNames?: ToastClassNames
  fillColor?: string
  borderColor?: string
  borderWidth?: number
  preset?: AnimationPreset
  bounce?: number
  spring?: boolean
  showTimestamp?: boolean
  showProgress?: boolean
  closeButton?: boolean | 'top-left' | 'top-right'
  // Sound
  sound?: boolean | string   // true = built-in tone, string = custom audio URL
  soundVolume?: number       // 0–1, default 0.5
  onDismiss?: (id: string) => void
  onAutoClose?: (id: string) => void
  promise?: Promise<unknown>
  promiseMessages?: ToastPromiseMessages
}

export interface ToastClassNames {
  wrapper?: string
  content?: string
  header?: string
  title?: string
  icon?: string
  description?: string
  actionWrapper?: string
  actionButton?: string
}

export interface Toast extends Required<Pick<ToastOptions, 'id' | 'type' | 'duration' | 'position' | 'showTimestamp' | 'showProgress' | 'spring'>> {
  title?: string
  description?: string | VNode
  action?: ToastAction | ToastAction[]
  icon?: string | VNode | Component
  classNames?: ToastClassNames
  fillColor?: string
  borderColor?: string
  borderWidth?: number
  closeButton?: boolean | 'top-left' | 'top-right'
  preset: AnimationPreset
  bounce: number
  createdAt: number
  remainingTime: number
  isPaused: boolean
  isExpanded: boolean
  isLeaving: boolean
  promise?: Promise<unknown>
  promiseMessages?: ToastPromiseMessages
  onDismiss?: (id: string) => void
  onAutoClose?: (id: string) => void
}

export interface ToastContainerProps {
  position?: ToastPosition
  duration?: number
  gap?: number
  offset?: number | string
  theme?: 'light' | 'dark'
  toastOptions?: Partial<ToastOptions>
  spring?: boolean
  bounce?: number
  preset?: AnimationPreset
  closeOnEscape?: boolean
  closeButton?: boolean | 'top-left' | 'top-right'
  showProgress?: boolean
  showTimestamp?: boolean
  sound?: boolean           // enable built-in sounds globally
  soundVolume?: number      // global volume 0–1
  maxQueue?: number
  queueOverflow?: QueueOverflow
  dir?: 'ltr' | 'rtl'
  swipeToDismiss?: boolean
  slotFilter?: (toast: Toast) => boolean
}

export interface ToastPluginOptions extends ToastContainerProps {
  teleportTarget?: string
  autoMount?: boolean
}
