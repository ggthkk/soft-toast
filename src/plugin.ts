import { createApp, h, type App } from 'vue'
import type { ToastPluginOptions } from './types'
import ToastContainer from './components/ToastContainer.vue'
import './styles/toast.css'

// Global state for plugin options
let pluginOptions: ToastPluginOptions = {
  position: 'top-right',
  duration: 4000,
  theme: 'light',
  spring: true,
  bounce: 0.4,
  preset: 'smooth',
  closeOnEscape: true,
  closeButton: false,
  showProgress: false,
  showTimestamp: false,
  maxQueue: 10,
  queueOverflow: 'drop-oldest',
  dir: 'ltr',
  swipeToDismiss: true,
  teleportTarget: 'body'
}

// Flag to check if container is mounted
let isContainerMounted = false

export const SoftToastPlugin = {
  install(app: App, options: ToastPluginOptions = {}) {
    // Merge options
    pluginOptions = { ...pluginOptions, ...options }
    
    // Only mount container once
    if (!isContainerMounted && typeof window !== 'undefined') {
      // Create a container div
      const containerId = 'soft-toast-global-container'
      let container = document.getElementById(containerId)
      
      if (!container) {
        container = document.createElement('div')
        container.id = containerId
        document.body.appendChild(container)
      }
      
      // Mount ToastContainer
      app.component('SoftToastContainer', ToastContainer)
      
      // Create a mini-app instance just for the toast container
      const toastContainerApp = createApp({
        render: () => h(ToastContainer, {
          position: pluginOptions.position,
          duration: pluginOptions.duration,
          gap: pluginOptions.gap,
          offset: pluginOptions.offset,
          theme: pluginOptions.theme,
          spring: pluginOptions.spring,
          bounce: pluginOptions.bounce,
          preset: pluginOptions.preset,
          closeOnEscape: pluginOptions.closeOnEscape,
          closeButton: pluginOptions.closeButton,
          showProgress: pluginOptions.showProgress,
          maxQueue: pluginOptions.maxQueue,
          queueOverflow: pluginOptions.queueOverflow,
          dir: pluginOptions.dir,
          swipeToDismiss: pluginOptions.swipeToDismiss
        })
      })
      
      toastContainerApp.mount(container)
      isContainerMounted = true
    }
    
    // Provide options to all components
    app.provide('softToastOptions', pluginOptions)
    
    // Set theme attribute on body
    if (typeof document !== 'undefined') {
      document.body.setAttribute('data-soft-toast-theme', pluginOptions.theme || 'light')
      document.body.setAttribute('data-soft-toast-dir', pluginOptions.dir || 'ltr')
    }
  }
}

// Export options getter
export const getToastOptions = () => pluginOptions
