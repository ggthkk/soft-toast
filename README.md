# @soft-toast/vue

A toast notification library for Vue 3 with fluid motion, stacked layout, and flexible customization.

## Features

- **Fluid Motion**: Smooth enter, exit, stack, and swipe interactions powered by GSAP.
- **Stacked Layout**: Toasts stay compact and readable; hover or tap to expand the full stack.
- **10 Positions**: All corners, edges, and center positions.
- **Motion Presets**: `smooth`, `bouncy`, `subtle`, or `snappy`.
- **Rich Content**: Titles, descriptions, action buttons, progress bars, timestamps, and custom icons.
- **Promise Toasts**: Built-in loading → success / error lifecycle for async operations.
- **Flash Messages**: Queue toasts that survive page navigation via `sessionStorage`.
- **Sound Support**: Optional synthesized tones or custom audio URLs per toast.
- **Smart Deduplication**: Calling with the same `id` updates the existing toast instead of stacking.
- **Custom Slots**: Override `#icon`, `#title`, `#description`, `#action`, and `#close-button`.
- **Swipe to Dismiss**: Pointer-event gesture support for both touch and mouse.
- **TypeScript**: Full type safety with exported types.

## Compatibility

| Package            | Framework | Supported versions  |
| ------------------ | --------- | ------------------- |
| `@soft-toast/vue`  | Vue       | Vue 3.3+            |
| `@soft-toast/nuxt` | Nuxt      | Nuxt 3.x / Nuxt 4.x |

## Installation

```bash
npm install @soft-toast/vue
# pnpm add @soft-toast/vue
# yarn add @soft-toast/vue
# bun add @soft-toast/vue
```

Register the plugin in `main.ts`:

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

```bash
npm install @soft-toast/nuxt
```

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@soft-toast/nuxt"],
  softToast: {
    position: "top-right",
    closeButton: true,
    showProgress: true,
  },
});
```

## Quick Start

```vue
<script setup lang="ts">
import { useSoftToast } from "@soft-toast/vue";

const toast = useSoftToast();

const save = () => {
  toast.success("Profile saved!", {
    description: "Your changes have been successfully saved.",
    duration: 2500,
    showProgress: true,
  });
};
</script>

<template>
  <button @click="save">Save Profile</button>
</template>
```

Plugin options are global defaults. Override them per toast as needed:

```typescript
toast.warning("File moved to trash", {
  description: "You can restore it from the activity log.",
  position: "bottom-right",
  duration: Infinity,
  closeButton: "top-left",
});
```

## API

### `useSoftToast()`

Returns a composable instance bound to the Vue component lifecycle.

```typescript
const toast = useSoftToast();
```

### `softToast`

Singleton — works outside Vue components (e.g. in router guards, Pinia stores, API interceptors).

```typescript
import { softToast } from "@soft-toast/vue";

softToast.error("Session expired", { duration: 6000 });
```

### Methods

| Method                             | Description                                           |
| ---------------------------------- | ----------------------------------------------------- |
| `toast.default(title, options?)`   | Default (unstyled) toast                              |
| `toast.success(title, options?)`   | Success toast                                         |
| `toast.error(title, options?)`     | Error toast                                           |
| `toast.warning(title, options?)`   | Warning toast                                         |
| `toast.info(title, options?)`      | Info toast                                            |
| `toast.loading(title, options?)`   | Persistent loading toast (use `update` to resolve it) |
| `toast.promise(promise, messages)` | Auto-transitions loading → success / error            |
| `toast.custom(options)`            | Full control — pass any `ToastOptions` directly       |
| `toast.update(id, options)`        | Update a visible toast by ID                          |
| `toast.dismiss(id?)`               | Dismiss one toast by ID, or all toasts if omitted     |
| `toast.dismissAll()`               | Dismiss all visible toasts                            |
| `toast.pause(id)`                  | Pause the auto-close timer                            |
| `toast.resume(id)`                 | Resume the auto-close timer                           |
| `toast.flash(title, options?)`     | Queue a toast that shows after the next navigation    |
| `toast.showFlashes()`              | Consume and show pending flash messages               |
| `toast.hasFlashes()`               | Returns `true` if there are pending flash messages    |

### `promise` example

```typescript
toast.promise(api.saveProfile(data), {
  loading: "Saving…",
  success: "Profile saved!",
  error: (err) => `Failed: ${err.message}`,
  description: {
    success: "Your changes are live.",
    error: "Please try again.",
  },
});
```

### `update` example

```typescript
const id = toast.loading("Uploading…");

await uploadFile(file);

toast.update(id, {
  type: "success",
  title: "Upload complete!",
  duration: 3000,
});
```

## Toast Options

| Option          | Type                                           | Default       | Description                                               |
| --------------- | ---------------------------------------------- | ------------- | --------------------------------------------------------- |
| `id`            | `string`                                       | auto          | Custom ID — same ID updates the existing toast            |
| `position`      | `ToastPosition`                                | `'top-right'` | Screen position                                           |
| `duration`      | `number`                                       | `4000`        | Auto-close delay in ms (`Infinity` disables auto-close)   |
| `description`   | `string \| VNode`                              | `undefined`   | Secondary text below the title                            |
| `action`        | `ToastAction \| ToastAction[]`                 | `undefined`   | One or more action buttons                                |
| `icon`          | `string \| VNode \| Component`                 | `undefined`   | Iconify icon string, VNode, or Vue component              |
| `preset`        | `'smooth' \| 'bouncy' \| 'subtle' \| 'snappy'` | `'smooth'`    | Motion style                                              |
| `showProgress`  | `boolean`                                      | `false`       | Decreasing progress bar                                   |
| `closeButton`   | `boolean \| 'top-left' \| 'top-right'`         | `false`       | Dismiss button position                                   |
| `showTimestamp` | `boolean`                                      | `false`       | Shows creation time                                       |
| `sound`         | `boolean \| string`                            | `undefined`   | `true` for built-in tone, or a URL to a custom audio file |
| `soundVolume`   | `number`                                       | `0.5`         | Playback volume (0–1)                                     |
| `classNames`    | `ToastClassNames`                              | `undefined`   | Custom CSS classes for individual parts of the toast      |
| `fillColor`     | `string`                                       | `undefined`   | Custom fill/accent color                                  |
| `borderColor`   | `string`                                       | `undefined`   | Custom border color                                       |
| `borderWidth`   | `number`                                       | `undefined`   | Custom border width in px                                 |
| `onDismiss`     | `(id: string) => void`                         | `undefined`   | Called when the toast is manually dismissed               |
| `onAutoClose`   | `(id: string) => void`                         | `undefined`   | Called when the toast auto-closes                         |

### `ToastAction`

```typescript
{
  label: string;
  onClick: () => void | Promise<void>;
  successLabel?: string; // Replaces button with this text on success, then auto-closes
  primary?: boolean;     // Applies primary button styling
  class?: string;        // Custom CSS class
}
```

## Icons

Supports **Iconify** icon strings and custom Vue components:

```typescript
// Iconify icon string
toast.success("Deployed!", { icon: "line-md:rocket-launch" });

// Custom Vue component
import MyIcon from "./MyIcon.vue";
toast.info("Update available", { icon: MyIcon });
```

## Flash Messages

Queue a toast that survives a page navigation and shows on the next load:

```typescript
const toast = useSoftToast();

const save = async () => {
  await api.save();
  toast.flash("Changes saved!", { type: "success" });
  router.push("/dashboard");
};
```

In `App.vue` or your root layout, consume pending flashes on mount:

```vue
<script setup lang="ts">
import { onMounted } from "vue";
import { useSoftToast } from "@soft-toast/vue";

const toast = useSoftToast();
onMounted(() => toast.showFlashes());
</script>
```

Flash messages expire automatically after 30 seconds if not consumed.

## Custom Slots

Override any part of the toast UI via named slots on `<SoftToastContainer>`.

When using slots, disable the plugin's auto-mounted container and place it manually in your layout:

```typescript
app.use(SoftToastPlugin, { autoMount: false });
```

```vue
<!-- App.vue or layout -->
<SoftToastContainer>
  <template #icon="{ toast }">
    <img src="/logo.png" alt="" />
  </template>

  <template #title="{ toast }">
    <strong>{{ toast.title }}</strong>
  </template>

  <template #description="{ toast }">
    <p>{{ toast.description }}</p>
  </template>

  <template #action="{ toast, execute }">
    <button
      v-for="action in Array.isArray(toast.action) ? toast.action : [toast.action]"
      :key="action.label"
      @click="execute(action)"
    >
      {{ action.label }}
    </button>
  </template>

  <template #close-button="{ dismiss }">
    <button @click="dismiss">Close</button>
  </template>
</SoftToastContainer>
```

Use `slotFilter` to apply custom slots only to specific toasts. Toasts that don't match keep the default rendering:

```vue
<SoftToastContainer :slot-filter="(toast) => toast.id.startsWith('custom-')">
  <template #title="{ toast }">
    <strong>{{ toast.title }}</strong>
  </template>
</SoftToastContainer>
```

## Container Props

| Prop             | Type                                           | Default         | Description                                          |
| ---------------- | ---------------------------------------------- | --------------- | ---------------------------------------------------- |
| `position`       | `ToastPosition`                                | `'top-right'`   | Default position for all toasts                      |
| `duration`       | `number`                                       | `5000`          | Default auto-close delay                             |
| `theme`          | `'light' \| 'dark'`                            | `'light'`       | Color theme                                          |
| `preset`         | `'smooth' \| 'bouncy' \| 'subtle' \| 'snappy'` | `'smooth'`      | Default motion preset                                |
| `closeButton`    | `boolean \| 'top-left' \| 'top-right'`         | `false`         | Show close button on all toasts                      |
| `showProgress`   | `boolean`                                      | `false`         | Show progress bar on all toasts                      |
| `showTimestamp`  | `boolean`                                      | `false`         | Show timestamp on all toasts                         |
| `closeOnEscape`  | `boolean`                                      | `true`          | Dismiss the most recent toast on `Escape`            |
| `swipeToDismiss` | `boolean`                                      | `true`          | Enable swipe-to-dismiss gesture                      |
| `maxQueue`       | `number`                                       | `Infinity`      | Maximum number of toasts visible at once             |
| `queueOverflow`  | `'drop-oldest' \| 'drop-newest'`               | `'drop-oldest'` | What to drop when queue is full                      |
| `gap`            | `number`                                       | `12`            | Gap in px between expanded toasts                    |
| `offset`         | `number \| string`                             | `'24px'`        | Distance from the screen edge                        |
| `dir`            | `'ltr' \| 'rtl'`                               | `'ltr'`         | Text direction                                       |
| `slotFilter`     | `(toast: Toast) => boolean`                    | `undefined`     | Function to select which toasts receive custom slots |

## Positions

10 available positions:

`top-left` · `top-center` · `top-right` · `bottom-left` · `bottom-center` · `bottom-right` · `top` · `bottom` · `left` · `right`

## License

MIT License.

> **Note on GSAP:** This library uses [GSAP](https://greensock.com/gsap/) for animations. GSAP is free for most uses under the [Standard No-Charge License](https://greensock.com/standard-license/).
