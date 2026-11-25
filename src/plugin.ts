import { createApp, h, type App, type Plugin } from "vue";
import type { ToastPluginOptions } from "./types";
import ToastContainer from "./components/ToastContainer.vue";
import { setToastDefaults, toastStore } from "./stores/toastStore";
import "./styles/toast.css";

// Global state for plugin options
const pluginDefaults: ToastPluginOptions = {
  position: "top-right",
  duration: 4000,
  theme: "light",
  spring: true,
  bounce: 0.4,
  preset: "smooth",
  closeOnEscape: true,
  closeButton: false,
  showProgress: false,
  showTimestamp: false,
  maxQueue: 10,
  queueOverflow: "drop-oldest",
  dir: "ltr",
  swipeToDismiss: true,
  sound: false,
  soundVolume: 0.5,
  teleportTarget: "body",
  autoMount: true,
};

let pluginOptions = { ...pluginDefaults };

// Flag to check if container is mounted
let isContainerMounted = false;

export const SoftToastPlugin: Plugin<[options?: ToastPluginOptions]> = {
  install(app: App<any>, options: ToastPluginOptions = {}) {
    // Merge options
    pluginOptions = { ...pluginDefaults, ...options };

    setToastDefaults(options);

    // Sync queue cap to the singleton store so softToast.* (used outside
    // components) and the container props enforce the same limit.
    toastStore.setMaxQueue(
      pluginOptions.maxQueue ?? Infinity,
      pluginOptions.queueOverflow ?? "drop-oldest",
    );
    toastStore.setDefaultSoundVolume(pluginOptions.soundVolume ?? 0.5);

    app.component("SoftToastContainer", ToastContainer);

    // Only mount container once
    if (
      pluginOptions.autoMount !== false &&
      !isContainerMounted &&
      typeof window !== "undefined"
    ) {
      // Create a container div
      const containerId = "soft-toast-global-container";
      let container = document.getElementById(containerId);

      if (!container) {
        container = document.createElement("div");
        container.id = containerId;
        document.body.appendChild(container);
      }

      // Create a mini-app instance just for the toast container
      const toastContainerApp = createApp({
        render: () =>
          h(ToastContainer, {
            position: pluginOptions.position,
            duration: options.duration,
            gap: pluginOptions.gap,
            offset: pluginOptions.offset,
            theme: pluginOptions.theme,
            motion: pluginOptions.motion,
            sound: pluginOptions.sound,
            soundVolume: pluginOptions.soundVolume,
            toastOptions: pluginOptions.toastOptions,
            spring: pluginOptions.spring,
            bounce: pluginOptions.bounce,
            preset: pluginOptions.preset,
            closeOnEscape: pluginOptions.closeOnEscape,
            closeButton: pluginOptions.closeButton,
            showProgress: pluginOptions.showProgress,
            maxQueue: pluginOptions.maxQueue,
            queueOverflow: pluginOptions.queueOverflow,
            dir: pluginOptions.dir,
            swipeToDismiss: pluginOptions.swipeToDismiss,
            showTimestamp: pluginOptions.showTimestamp,
            slotFilter: pluginOptions.slotFilter,
          }),
      });

      toastContainerApp.mount(container);
      isContainerMounted = true;
    }

    // Provide options to all components
    app.provide("softToastOptions", pluginOptions);
    app.provide("softToastDefaults", options);

    // Set theme attribute on body
    if (typeof document !== "undefined") {
      document.body.setAttribute(
        "data-soft-toast-theme",
        pluginOptions.theme || "light",
      );
      document.body.setAttribute(
        "data-soft-toast-dir",
        pluginOptions.dir || "ltr",
      );
    }
  },
};

// Export options getter
export const getToastOptions = () => pluginOptions;
