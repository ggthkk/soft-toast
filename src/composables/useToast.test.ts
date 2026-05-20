import { describe, it, expect, beforeEach } from 'bun:test'
import { useToast, toast } from './useToast'
import { toastStore } from '../stores/toastStore'

// Reset store state before each test
beforeEach(() => {
  toastStore.clearAll()
})

// ─── useToast() composable ────────────────────────────────────────────────────

describe('useToast()', () => {
  it('returns an object with all API methods', () => {
    const t = useToast()
    expect(typeof t.default).toBe('function')
    expect(typeof t.success).toBe('function')
    expect(typeof t.error).toBe('function')
    expect(typeof t.warning).toBe('function')
    expect(typeof t.info).toBe('function')
    expect(typeof t.promise).toBe('function')
    expect(typeof t.custom).toBe('function')
    expect(typeof t.update).toBe('function')
    expect(typeof t.dismiss).toBe('function')
    expect(typeof t.dismissAll).toBe('function')
    expect(typeof t.pause).toBe('function')
    expect(typeof t.resume).toBe('function')
  })

  it('default() adds a toast with type "default"', () => {
    const t = useToast()
    const id = t.default('Hello')
    const toasts = toastStore.toasts.value
    expect(toasts.length).toBe(1)
    expect(toasts[0].type).toBe('default')
    expect(toasts[0].title).toBe('Hello')
    expect(toasts[0].id).toBe(id)
  })

  it('success() adds a toast with type "success"', () => {
    const t = useToast()
    t.success('Done!')
    expect(toastStore.toasts.value[0].type).toBe('success')
    expect(toastStore.toasts.value[0].title).toBe('Done!')
  })

  it('error() adds a toast with type "error"', () => {
    const t = useToast()
    t.error('Oops!')
    expect(toastStore.toasts.value[0].type).toBe('error')
  })

  it('warning() adds a toast with type "warning"', () => {
    const t = useToast()
    t.warning('Watch out!')
    expect(toastStore.toasts.value[0].type).toBe('warning')
  })

  it('info() adds a toast with type "info"', () => {
    const t = useToast()
    t.info('FYI')
    expect(toastStore.toasts.value[0].type).toBe('info')
  })

  it('custom() passes options through directly', () => {
    const t = useToast()
    t.custom({ type: 'success', title: 'Custom', description: 'My desc', duration: 9999 })
    const added = toastStore.toasts.value[0]
    expect(added.title).toBe('Custom')
    expect(added.description).toBe('My desc')
    expect(added.duration).toBe(9999)
  })

  it('update() changes an existing toast', () => {
    const t = useToast()
    const id = t.default('Before')
    t.update(id, { title: 'After', type: 'success' })
    const updated = toastStore.toasts.value.find(x => x.id === id)
    expect(updated?.title).toBe('After')
    expect(updated?.type).toBe('success')
  })

  it('dismiss() marks toast as isLeaving', () => {
    const t = useToast()
    const id = t.default('Bye')
    t.dismiss(id)
    const toast = toastStore.toasts.value.find(x => x.id === id)
    expect(toast?.isLeaving).toBe(true)
  })

  it('pause() and resume() toggle isPaused', () => {
    const t = useToast()
    const id = t.default('Pausing')
    t.pause(id)
    expect(toastStore.toasts.value[0].isPaused).toBe(true)
    t.resume(id)
    expect(toastStore.toasts.value[0].isPaused).toBe(false)
  })

  it('forward options like duration, description, position', () => {
    const t = useToast()
    t.success('With opts', {
      description: 'More info',
      duration: 1234,
      position: 'bottom-center'
    })
    const added = toastStore.toasts.value[0]
    expect(added.description).toBe('More info')
    expect(added.duration).toBe(1234)
    expect(added.position).toBe('bottom-center')
  })
})

// ─── toast (static object) ────────────────────────────────────────────────────

describe('toast (static API)', () => {
  it('toast.success() adds a success toast', () => {
    toast.success('Static success')
    expect(toastStore.toasts.value[0].type).toBe('success')
    expect(toastStore.toasts.value[0].title).toBe('Static success')
  })

  it('toast.error() adds an error toast', () => {
    toast.error('Static error')
    expect(toastStore.toasts.value[0].type).toBe('error')
  })

  it('toast.warning() adds a warning toast', () => {
    toast.warning('Careful')
    expect(toastStore.toasts.value[0].type).toBe('warning')
  })

  it('toast.info() adds an info toast', () => {
    toast.info('Just so you know')
    expect(toastStore.toasts.value[0].type).toBe('info')
  })

  it('toast.default() adds a default toast', () => {
    toast.default('Hello world')
    expect(toastStore.toasts.value[0].type).toBe('default')
  })

  it('toast.custom() adds toast with arbitrary options', () => {
    toast.custom({ title: 'Custom static', type: 'info', id: 'static-1' })
    expect(toastStore.toasts.value[0].id).toBe('static-1')
    expect(toastStore.toasts.value[0].title).toBe('Custom static')
  })

  it('toast.update() modifies a toast', () => {
    const id = toast.default('Initial')
    toast.update(id, { title: 'Updated' })
    expect(toastStore.toasts.value.find(x => x.id === id)?.title).toBe('Updated')
  })

  it('toast.pause() and toast.resume() work', () => {
    const id = toast.info('Pausable')
    toast.pause(id)
    expect(toastStore.toasts.value[0].isPaused).toBe(true)
    toast.resume(id)
    expect(toastStore.toasts.value[0].isPaused).toBe(false)
  })

  it('toast.dismiss() marks toast as leaving', () => {
    const id = toast.success('Going away')
    toast.dismiss(id)
    expect(toastStore.toasts.value.find(x => x.id === id)?.isLeaving).toBe(true)
  })

  it('multiple toasts are ordered newest-first', () => {
    toast.default('First')
    toast.success('Second')
    toast.error('Third')
    const titles = toastStore.toasts.value.map(t => t.title)
    expect(titles).toEqual(['Third', 'Second', 'First'])
  })
})

// ─── toast.promise() ─────────────────────────────────────────────────────────

describe('toast.promise()', () => {
  it('resolves: updates toast to success', async () => {
    const id = await toast.promise(
      Promise.resolve('ok'),
      { loading: 'Loading…', success: 'Done!', error: 'Failed' }
    )
    // After resolve the store should have a success toast
    const t = toastStore.toasts.value.find(x => x.title === 'Done!')
    expect(t?.type).toBe('success')
    expect(id).toBe('ok')
  })

  it('rejects: updates toast to error and re-throws', async () => {
    let caught: unknown
    try {
      await toast.promise(
        Promise.reject(new Error('boom')),
        { loading: 'Loading…', success: 'Done!', error: 'Something failed' }
      )
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    const t = toastStore.toasts.value.find(x => x.title === 'Something failed')
    expect(t?.type).toBe('error')
  })
})

// ─── Flash & sound API surface ────────────────────────────────────────────────

describe('useToast() — flash API methods', () => {
  it('returns flash, showFlashes, hasFlashes methods', () => {
    const t = useToast()
    expect(typeof t.flash).toBe('function')
    expect(typeof t.showFlashes).toBe('function')
    expect(typeof t.hasFlashes).toBe('function')
  })
})

describe('toast (static) — flash API methods', () => {
  it('toast.flash is a function', () => {
    expect(typeof toast.flash).toBe('function')
  })

  it('toast.showFlashes is a function', () => {
    expect(typeof toast.showFlashes).toBe('function')
  })

  it('toast.hasFlashes is a function', () => {
    expect(typeof toast.hasFlashes).toBe('function')
  })
})
