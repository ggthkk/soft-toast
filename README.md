# @soft-toast/vue

A toast notification library for Vue 3 with soft motion, compact defaults, and flexible customization.

## Features

- **Fluid Motion**: Smooth enter, exit, stack, and swipe interactions.
- **Stacked Layout**: Toasts stay compact, readable, and easy to scan.
- **Position Options**: 11 positions including corners, edges, and center.
- **Motion Presets**: Choose from `smooth`, `bouncy`, `subtle`, or `snappy` presets.
- **Rich Content**: Supports titles, descriptions, action buttons, progress bars, and custom icons.
- **Promise Handling**: Built-in support for async operations with loading states.
- **Swipe to Dismiss**: Touch gesture support for mobile devices.
- **TypeScript**: Built with TypeScript for type safety.

## Compatibility

| Package            | Framework | Supported versions  |
| ------------------ | --------- | ------------------- |
| `@soft-toast/vue`  | Vue       | Vue 3.3+            |
| `@soft-toast/nuxt` | Nuxt      | Nuxt 3.x / Nuxt 4.x |

## Installation

### Vue 3

```bash
npm install @soft-toast/vue
```

Package manager equivalents:

```bash
pnpm add @soft-toast/vue
yarn add @soft-toast/vue
bun add @soft-toast/vue
```

Register the Vue plugin in `main.ts` or `main.js`:

```typescript
import { createApp } from "vue";
import App from "./App.vue";
import { SoftToastPlugin } from "@soft-toast/vue";
import "@soft-toast/vue/dist/style.css";

const app = createApp(App);

app.use(SoftToastPlugin, {
  position: "top-right",
  duration: 4000,
  closeButton: true,
  showProgress: true,
});

app.mount("#app");
```

### Nuxt 3 / Nuxt 4

For Nuxt apps, install the companion module:

```bash
npm install @soft-toast/nuxt
```

Package manager equivalents:

```bash
pnpm add @soft-toast/nuxt
yarn add @soft-toast/nuxt
bun add @soft-toast/nuxt
```

Add it to `nuxt.config.ts`:

```typescript
export default defineNuxtConfig({
  modules: ["@soft-toast/nuxt"],
});
```

`softToast` is optional. Add it only when you want to override global defaults:

```typescript
export default defineNuxtConfig({
  modules: ["@soft-toast/nuxt"],
  softToast: {
    closeButton: true,
    showProgress: true,
  },
});
```

## Quick Start

Use it anywhere in your Vue or Nuxt components:

```vue
<script setup>
import { useToast } from "@soft-toast/vue";

const toast = useToast();

const showToast = () => {
  toast.success("Profile saved!", {
    description: "Your changes have been successfully saved.",
    position: "top-right",
    duration: 2500,
    closeButton: true,
    showProgress: true,
  });
};
</script>

<template>
  <button @click="showToast">Save Profile</button>
</template>
```

The plugin options are global defaults. You can override them per toast when a page needs different behavior:

```typescript
toast.warning("File moved to trash", {
  description: "You can restore it from the activity log.",
  position: "bottom-right",
  duration: Infinity,
  closeButton: "top-left",
  showProgress: false,
});
```

## API Overview

### `toast[type](title, options)`

Available types: `default`, `success`, `error`, `warning`, `info`, `promise`.

**Example:**

```typescript
toast.error("Network Error", {
  description: "Failed to connect to the server.",
  duration: 6000,
  action: {
    label: "Retry",
    onClick: () => retryConnection(),
  },
});
```

### Options

| Property        | Type                                           | Default       | Description                                                    |
| --------------- | ---------------------------------------------- | ------------- | -------------------------------------------------------------- |
| `position`      | `ToastPosition`                                | `'top-right'` | Position on screen (e.g. `'top'`, `'bottom-left'`, `'center'`) |
| `duration`      | `number`                                       | `4000`        | Auto-close delay in ms (`Infinity` disables auto-close)        |
| `preset`        | `'smooth' \| 'bouncy' \| 'subtle' \| 'snappy'` | `'smooth'`    | Motion style                                                   |
| `description`   | `string \| VNode`                              | `undefined`   | Secondary text below the title                                 |
| `action`        | `ToastAction \| ToastAction[]`                 | `undefined`   | Interactive button config (`label`, `onClick`)                 |
| `showProgress`  | `boolean`                                      | `false`       | Shows a decreasing progress bar                                |
| `closeButton`   | `boolean \| 'top-left' \| 'top-right'`         | `false`       | Shows a dismiss button for this toast                          |
| `showTimestamp` | `boolean`                                      | `false`       | Shows the time the toast was created                           |
| `icon`          | `string \| VNode \| Component`                 | `undefined`   | Custom icon string (Iconify `line-md` support) or Component    |

## Icons & Customization

Supports **Iconify** icons and custom Vue components.

```typescript
// 1. Using Iconify icon string
toast.success("Awesome!", { icon: "line-md:star" });

// 2. Using a Custom Vue Component
import MyIcon from "./MyIcon.vue";
toast.info("Custom Icon", { icon: MyIcon });
```

## Slot Architecture

`@soft-toast/vue` provides customization slots for `<SoftToastContainer>`.

Available slots: `#icon`, `#title`, `#description`, `#action`, `#close-button`.

```vue
<SoftToastContainer>
  <!-- Override the close button -->
  <template #close-button="{ dismiss }">
    <button @click="dismiss" class="my-custom-close-btn">Close</button>
  </template>
  
  <!-- Override the action button -->
  <template #action="{ toast, execute }">
    <button @click="execute" class="my-custom-action-btn">
      {{ toast.action.label }}
    </button>
  </template>
</SoftToastContainer>
```

## Positions

11 available positions:
`top-left`, `top-center`, `top-right`, `bottom-left`, `bottom-center`, `bottom-right`, `top`, `bottom`, `left`, `right`, `center`.

## License

MIT License.

> **Note on GSAP:** This library uses [GSAP](https://greensock.com/gsap/) for animations. GSAP is subject to its own [Standard No-Charge License](https://greensock.com/standard-license/).
