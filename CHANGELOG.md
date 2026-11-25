# Changelog

## 1.2.0 - 2026-11-25

- Mount only active toast positions and batch swipe updates per frame.
- Schedule auto-close at the deadline. Progress follows pauses, resumes, and duration resets.
- Apply plugin defaults to both `softToast` and `useSoftToast()` calls. Individual toasts can override them.
- Support `motion: "reduced"`, theme CSS variables, and `toastOptions.classNames`.
- Honor numeric and CSS `offset` values. Escape dismisses the newest active toast across all positions.
- For custom countdowns, use `toastStore.getRemainingTime(toast)` to read the current time remaining in milliseconds.

## 1.1.5 - 2026-07-16

### Fixed

- Prevent delayed dismiss and auto-close cleanup from deleting a newer toast
  that reuses the same public ID.
- Remove leaving same-ID toast instances before mounting their replacements,
  preventing duplicate Vue keys and stale animation state.
- Route swipe and close-button dismissal through the store-owned lifecycle so
  competing cleanup timers cannot remove the wrong toast.
- Call `onDismiss` once for each active toast dismissed by `dismissAll()`.

### Tests

- Add post-animation regression coverage for dismiss-all, dismiss-by-ID,
  dismiss-by-type, and stale instance cleanup with reused IDs.
