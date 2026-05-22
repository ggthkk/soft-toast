import { describe, it, expect } from 'bun:test'

// Test that all public exports exist and have the right shape
// This acts as a "contract test" — if something is accidentally removed, CI will catch it.

describe('Package exports', () => {
  it('exports the expected public API', async () => {
    const api = await import('./index')
    expect(Object.keys(api).sort()).toEqual([
      'SoftToastPlugin',
      'ToastContainer',
      'ToastItem',
      'consumeFlashes',
      'getToastOptions',
      'hasPendingFlashes',
      'queueFlash',
      'softToast',
      'toastStore',
      'useFlash',
      'useSoftToast',
    ])
  })

  it('exports SoftToastPlugin with install()', async () => {
    const { SoftToastPlugin } = await import('./index')
    expect(SoftToastPlugin).toBeDefined()
    expect(typeof SoftToastPlugin.install).toBe('function')
  })

  it('exports getToastOptions()', async () => {
    const { getToastOptions } = await import('./index')
    expect(typeof getToastOptions).toBe('function')
    const opts = getToastOptions()
    // Should return an object with default values
    expect(opts).toHaveProperty('position')
    expect(opts).toHaveProperty('duration')
    expect(opts).toHaveProperty('theme')
  })

  it('exports useSoftToast()', async () => {
    const { useSoftToast } = await import('./index')
    expect(typeof useSoftToast).toBe('function')
    const api = useSoftToast()
    expect(typeof api.success).toBe('function')
    expect(typeof api.error).toBe('function')
  })

  it('exports softToast object', async () => {
    const { softToast } = await import('./index')
    expect(softToast).toBeDefined()
    expect(typeof softToast.success).toBe('function')
    expect(typeof softToast.error).toBe('function')
    expect(typeof softToast.warning).toBe('function')
    expect(typeof softToast.info).toBe('function')
    expect(typeof softToast.default).toBe('function')
    expect(typeof softToast.promise).toBe('function')
    expect(typeof softToast.custom).toBe('function')
    expect(typeof softToast.update).toBe('function')
    expect(typeof softToast.dismiss).toBe('function')
    expect(typeof softToast.dismissAll).toBe('function')
    expect(typeof softToast.pause).toBe('function')
    expect(typeof softToast.resume).toBe('function')
    // Flash & sound API
    expect(typeof softToast.flash).toBe('function')
    expect(typeof softToast.showFlashes).toBe('function')
    expect(typeof softToast.hasFlashes).toBe('function')
  })

  it('exports toastStore with all methods', async () => {
    const { toastStore } = await import('./index')
    expect(toastStore).toBeDefined()
    expect(typeof toastStore.add).toBe('function')
    expect(typeof toastStore.remove).toBe('function')
    expect(typeof toastStore.clearAll).toBe('function')
    expect(typeof toastStore.dismiss).toBe('function')
    expect(typeof toastStore.pause).toBe('function')
    expect(typeof toastStore.resume).toBe('function')
    expect(typeof toastStore.update).toBe('function')
    expect(typeof toastStore.success).toBe('function')
    expect(typeof toastStore.error).toBe('function')
    expect(typeof toastStore.warning).toBe('function')
    expect(typeof toastStore.info).toBe('function')
    expect(typeof toastStore.promise).toBe('function')
    expect(typeof toastStore.getToastsByPosition).toBe('function')
    // toasts should be a computed ref
    expect(toastStore.toasts).toBeDefined()
    expect(typeof toastStore.toasts.value).toBe('object')
  })
})
