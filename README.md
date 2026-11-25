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
| `@soft-toast/vue`  | Nuxt (client plugin) | Nuxt 3.x / Nuxt 4.x |

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

Install `@soft-toast/vue` as above. Create `plugins/soft-toast.client.ts` (Nuxt 3)
or `app/plugins/soft-toast.client.ts` (Nuxt 4) with the following contents:

```typescript
import { SoftToastPlugin } from "@soft-toast/vue";
import "@soft-toast/vue/style.css";

export default defineNuxtPlugin(({ vueApp }) => {
  vueApp.use(SoftToastPlugin, { closeButton: true, showProgress: true });
});
```

Import `softToast` from `@soft-toast/vue` to trigger a notification in a client event handler.

## Quick Start

```vue
<script setup lang="ts">
import { useSoftToast } from "@soft-toast/vue";

const softToast = useSoftToast();

const save = () => {
  softToast.success("Profile saved!", {
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

Plugin options apply to both `softToast` and `useSoftToast()`. Set `position`,
`duration`, or `showProgress` once at installation. Options on a single
notification take precedence. Updating its duration restarts the countdown
and progress bar together. Updating only the message keeps the existing deadline.
For custom content, `toast.remainingTime` is a snapshot. Read
`toastStore.getRemainingTime(toast)` for the current milliseconds remaining.

```typescript
softToast.warning("File moved to trash", {
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
const softToast = useSoftToast();
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
| `softToast.default(title, options?)`   | Default (unstyled) toast                              |
| `softToast.success(title, options?)`   | Success toast                                         |
| `softToast.error(title, options?)`     | Error toast                                           |
| `softToast.warning(title, options?)`   | Warning toast                                         |
| `softToast.info(title, options?)`      | Info toast                                            |
| `softToast.loading(title, options?)`   | Persistent loading toast (use `update` to resolve it) |
| `softToast.promise(promise, messages)` | Auto-transitions loading → success / error            |
| `softToast.custom(options)`            | Full control, including custom Vue component content  |
| `softToast.update(id, options)`        | Update a visible toast by ID                          |
| `softToast.dismiss(id?)`               | Dismiss one toast by ID, or all toasts if omitted     |
| `softToast.dismissAll()`               | Dismiss all visible toasts                            |
| `softToast.pause(id)`                  | Pause the auto-close timer                            |
| `softToast.resume(id)`                 | Resume the auto-close timer                           |
| `softToast.flash(title, options?)`     | Queue a toast that shows after the next navigation    |
| `softToast.showFlashes()`              | Consume and show pending flash messages               |
| `softToast.hasFlashes()`               | Returns `true` if there are pending flash messages    |

### Dismissal behavior

Toast IDs can be reused immediately after `dismiss(id)` or `dismissAll()`.
If a replacement toast uses the same public `id` while the previous toast is
still animating out, the replacement remains visible and owns its own timer.
Manual dismissal callbacks run once per dismissed toast, including
`dismissAll()`.

### `promise` example

```typescript
softToast.promise(api.saveProfile(data), {
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
const id = softToast.loading("Uploading…");

await uploadFile(file);

softToast.update(id, {
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
| `component`     | `Component`                                    | `undefined`   | Render a custom Vue component inside this toast           |
| `props`         | `Record<string, unknown>`                      | `{}`          | Props passed to `component`                               |
| `render`        | `(context) => VNodeChild`                      | `undefined`   | Advanced custom render function                           |
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
softToast.success("Deployed!", { icon: "line-md:rocket-launch" });

// Custom Vue component
import MyIcon from "./MyIcon.vue";
softToast.info("Update available", { icon: MyIcon });
```

## Flash Messages

Queue a toast that survives a page navigation and shows on the next load:

```typescript
const softToast = useSoftToast();

const save = async () => {
  await api.save();
  softToast.flash("Changes saved!", { type: "success" });
  router.push("/dashboard");
};
```

In `App.vue` or your root layout, consume pending flashes on mount:

```vue
<script setup lang="ts">
import { onMounted } from "vue";
import { useSoftToast } from "@soft-toast/vue";

const softToast = useSoftToast();
onMounted(() => softToast.showFlashes());
</script>
```

Flash messages expire automatically after 30 seconds if not consumed.

## Lower-motion notifications

Set `motion: "reduced"` in the plugin options (or on a manual container) to
place cards immediately during entry, exit and restacking. The default
`"auto"` follows the operating system's reduced-motion preference.
For a smaller stack on slower devices, combine this with `maxQueue: 3`.

## Match your site's theme

Import your theme stylesheet after `@soft-toast/vue/style.css`. Toasts mount under
`body`, so put these variables in global CSS. Set both radius variables for
uniform corners. Leave either unset to keep the built-in shape.

```css
.soft-toast-container {
  --st-surface: #172033;
  --st-title-color: white;
  --st-description-color: #d1d5db;
  --st-font-family: inherit;
  --st-radius: 10px;
  --st-corner-radius: 10px;
  --st-padding: 12px 16px;
  --st-card-shadow: none;
}
```

To reuse your site's existing CSS classes, configure the parts once. A toast
can override individual parts and inherit the other configured classes.

```typescript
app.use(SoftToastPlugin, {
  toastOptions: { classNames: { title: "notice-heading", actionButton: "brand-button" } },
});

softToast.error("Upload failed", { classNames: { title: "error-heading" } });
```

With a manually mounted container, pass the same object as its `toastOptions`
prop. Available parts are `wrapper`, `content`, `header`, `title`, `icon`,
`description`, `actionWrapper`, and `actionButton`.

## Custom Component Toasts

Use this when one toast needs its own Vue component, usually after fetching data in a feature component.
You do not need to disable `autoMount` or place a custom container for this pattern.

```vue
<!-- UserInviteToast.vue -->
<script setup lang="ts">
defineProps<{
  user: { name: string; role: string; avatar: string };
  dismiss: () => void;
}>();
</script>

<template>
  <div class="user-toast">
    <img :src="user.avatar" alt="" />
    <div>
      <strong>{{ user.name }}</strong>
      <p>{{ user.role }} joined the project</p>
      <button @click="dismiss">View profile</button>
    </div>
  </div>
</template>
```

```vue
<!-- Any feature component -->
<script setup lang="ts">
import { useSoftToast } from "@soft-toast/vue";
import UserInviteToast from "./UserInviteToast.vue";

const softToast = useSoftToast();

const showUserToast = async () => {
  const user = await fetchUser();

  softToast.custom({
    component: UserInviteToast,
    props: { user },
    duration: 8000,
    closeButton: true,
    showProgress: true,
  });
};
</script>

<template>
  <button @click="showUserToast">Show user toast</button>
</template>
```

Custom components automatically receive these extra props:

| Prop           | Description                                      |
| -------------- | ------------------------------------------------ |
| `toast`        | The full toast object                            |
| `dismiss`      | Dismiss this toast                               |
| `execute`      | Run one of the toast's configured action objects |
| `hasSucceeded` | `true` after an async action succeeds            |

For advanced cases, use a render function:

```typescript
import { h } from "vue";
import UserInviteToast from "./UserInviteToast.vue";

softToast.custom({
  render: ({ dismiss }) => h(UserInviteToast, { user, dismiss }),
});
```

## Custom Slots

Use slots when you want to restyle the toast layout globally or for a group of toasts.
For one-off custom content from a feature component, prefer `softToast.custom({ component, props })`.

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

By default, the slots above apply to every toast rendered by that container.
Use `slotFilter` only when you want custom slots for some toasts while the others keep the default rendering:

```vue
<!-- Mark toasts that should use custom slots -->
softToast.info('Hello', { meta: { useCustomSlots: true } })

<!-- Then filter by meta in the container -->
<SoftToastContainer :slot-filter="(toast) => toast.meta?.useCustomSlots">
  <template #title="{ toast }">
    <strong>{{ toast.title }}</strong>
  </template>
</SoftToastContainer>
```

## Container Props

| Prop             | Type                                           | Default         | Description                                          |
| ---------------- | ---------------------------------------------- | --------------- | ---------------------------------------------------- |
| `position`       | `ToastPosition`                                | `'top-right'`   | Default position for all toasts                      |
| `duration`       | `number`                                       | `4000`          | Default auto-close delay                             |
| `theme`          | `'light' \| 'dark'`                            | `'light'`       | Color theme                                          |
| `preset`         | `'smooth' \| 'bouncy' \| 'subtle' \| 'snappy'` | `'smooth'`      | Default motion preset                                |
| `closeButton`    | `boolean \| 'top-left' \| 'top-right'`         | `false`         | Show close button on all toasts                      |
| `showProgress`   | `boolean`                                      | `false`         | Show progress bar on all toasts                      |
| `showTimestamp`  | `boolean`                                      | `false`         | Show timestamp on all toasts                         |
| `closeOnEscape`  | `boolean`                                      | `true`          | Dismiss the most recent toast on `Escape`            |
| `swipeToDismiss` | `boolean`                                      | `true`          | Enable swipe-to-dismiss gesture                      |
| `maxQueue`       | `number`                                       | `10`            | Maximum number of toasts visible at once             |
| `queueOverflow`  | `'drop-oldest' \| 'drop-newest'`               | `'drop-oldest'` | What to drop when queue is full                      |
| `gap`            | `number`                                       | `12`            | Gap in px between expanded toasts                    |
| `offset`         | `number \| string`                             | `32px` desktop, `12px` at ≤640px | Distance from the screen edge. Numbers use pixels. CSS lengths such as `2rem` are supported. |
| `dir`            | `'ltr' \| 'rtl'`                               | `'ltr'`         | Text direction                                       |
| `slotFilter`     | `(toast: Toast) => boolean`                    | `undefined`     | Function to select which toasts receive custom slots |

## Positions

10 available positions:

`top-left` · `top-center` · `top-right` · `bottom-left` · `bottom-center` · `bottom-right` · `top` · `bottom` · `left` · `right`

## License

MIT License.

> **Note on GSAP:** This library uses [GSAP](https://greensock.com/gsap/) for animations. GSAP is free for most uses under the [Standard No-Charge License](https://greensock.com/standard-license/).
