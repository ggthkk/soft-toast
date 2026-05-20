import { describe, it, expect } from 'bun:test'

// Test that all public exports exist and have the right shape
// This acts as a "contract test" — if something is accidentally removed, CI will catch it.

describe('Package exports', () => {
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

  it('exports useToast()', async () => {
    const { useToast } = await import('./index')
    expect(typeof useToast).toBe('function')
    const api = useToast()
    expect(typeof api.success).toBe('function')
    expect(typeof api.error).toBe('function')
  })

  it('exports toast object', async () => {
    const { toast } = await import('./index')
    expect(toast).toBeDefined()
    expect(typeof toast.success).toBe('function')
    expect(typeof toast.error).toBe('function')
    expect(typeof toast.warning).toBe('function')
    expect(typeof toast.info).toBe('function')
    expect(typeof toast.default).toBe('function')
    expect(typeof toast.promise).toBe('function')
    expect(typeof toast.custom).toBe('function')
    expect(typeof toast.update).toBe('function')
    expect(typeof toast.dismiss).toBe('function')
    expect(typeof toast.dismissAll).toBe('function')
    expect(typeof toast.pause).toBe('function')
    expect(typeof toast.resume).toBe('function')
    // Flash & sound API
    expect(typeof toast.flash).toBe('function')
    expect(typeof toast.showFlashes).toBe('function')
    expect(typeof toast.hasFlashes).toBe('function')
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
