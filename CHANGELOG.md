# Changelog

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
