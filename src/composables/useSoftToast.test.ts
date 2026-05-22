import { describe, it, expect, beforeEach } from 'bun:test'
import { useSoftToast, softToast } from './useSoftToast'
import { toastStore } from '../stores/toastStore'

// Reset store state before each test
beforeEach(() => {
  toastStore.clearAll()
})

// ─── useSoftToast() composable ────────────────────────────────────────────────────

describe('useSoftToast()', () => {
  it('returns an object with all API methods', () => {
    const t = useSoftToast()
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
    const t = useSoftToast()
    const id = t.default('Hello')
    const toasts = toastStore.toasts.value
    expect(toasts.length).toBe(1)
    expect(toasts[0].type).toBe('default')
    expect(toasts[0].title).toBe('Hello')
    expect(toasts[0].id).toBe(id)
  })

  it('success() adds a toast with type "success"', () => {
    const t = useSoftToast()
    t.success('Done!')
    expect(toastStore.toasts.value[0].type).toBe('success')
    expect(toastStore.toasts.value[0].title).toBe('Done!')
  })

  it('error() adds a toast with type "error"', () => {
    const t = useSoftToast()
    t.error('Oops!')
    expect(toastStore.toasts.value[0].type).toBe('error')
  })

  it('warning() adds a toast with type "warning"', () => {
    const t = useSoftToast()
    t.warning('Watch out!')
    expect(toastStore.toasts.value[0].type).toBe('warning')
  })

  it('info() adds a toast with type "info"', () => {
    const t = useSoftToast()
    t.info('FYI')
    expect(toastStore.toasts.value[0].type).toBe('info')
  })

  it('custom() passes options through directly', () => {
    const t = useSoftToast()
    t.custom({ type: 'success', title: 'Custom', description: 'My desc', duration: 9999 })
    const added = toastStore.toasts.value[0]
    expect(added.title).toBe('Custom')
    expect(added.description).toBe('My desc')
    expect(added.duration).toBe(9999)
  })

  it('update() changes an existing toast', () => {
    const t = useSoftToast()
    const id = t.default('Before')
    t.update(id, { title: 'After', type: 'success' })
    const updated = toastStore.toasts.value.find(x => x.id === id)
    expect(updated?.title).toBe('After')
    expect(updated?.type).toBe('success')
  })

  it('dismiss() marks toast as isLeaving', () => {
    const t = useSoftToast()
    const id = t.default('Bye')
    t.dismiss(id)
    const toast = toastStore.toasts.value.find(x => x.id === id)
    expect(toast?.isLeaving).toBe(true)
  })

  it('pause() and resume() toggle isPaused', () => {
    const t = useSoftToast()
    const id = t.default('Pausing')
    t.pause(id)
    expect(toastStore.toasts.value[0].isPaused).toBe(true)
    t.resume(id)
    expect(toastStore.toasts.value[0].isPaused).toBe(false)
  })

  it('forward options like duration, description, position', () => {
    const t = useSoftToast()
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

// ─── softToast (static object) ────────────────────────────────────────────────

describe('softToast (static API)', () => {
  it('softToast.success() adds a success toast', () => {
    softToast.success('Static success')
    expect(toastStore.toasts.value[0].type).toBe('success')
    expect(toastStore.toasts.value[0].title).toBe('Static success')
  })

  it('softToast.error() adds an error toast', () => {
    softToast.error('Static error')
    expect(toastStore.toasts.value[0].type).toBe('error')
  })

  it('softToast.warning() adds a warning toast', () => {
    softToast.warning('Careful')
    expect(toastStore.toasts.value[0].type).toBe('warning')
  })

  it('softToast.info() adds an info toast', () => {
    softToast.info('Just so you know')
    expect(toastStore.toasts.value[0].type).toBe('info')
  })

  it('softToast.default() adds a default toast', () => {
    softToast.default('Hello world')
    expect(toastStore.toasts.value[0].type).toBe('default')
  })

  it('softToast.custom() adds toast with arbitrary options', () => {
    softToast.custom({ title: 'Custom static', type: 'info', id: 'static-1' })
    expect(toastStore.toasts.value[0].id).toBe('static-1')
    expect(toastStore.toasts.value[0].title).toBe('Custom static')
  })

  it('softToast.update() modifies a toast', () => {
    const id = softToast.default('Initial')
    softToast.update(id, { title: 'Updated' })
    expect(toastStore.toasts.value.find(x => x.id === id)?.title).toBe('Updated')
  })

  it('softToast.pause() and softToast.resume() work', () => {
    const id = softToast.info('Pausable')
    softToast.pause(id)
    expect(toastStore.toasts.value[0].isPaused).toBe(true)
    softToast.resume(id)
    expect(toastStore.toasts.value[0].isPaused).toBe(false)
  })

  it('softToast.dismiss() marks toast as leaving', () => {
    const id = softToast.success('Going away')
    softToast.dismiss(id)
    expect(toastStore.toasts.value.find(x => x.id === id)?.isLeaving).toBe(true)
  })

  it('multiple toasts are ordered newest-first', () => {
    softToast.default('First')
    softToast.success('Second')
    softToast.error('Third')
    const titles = toastStore.toasts.value.map(t => t.title)
    expect(titles).toEqual(['Third', 'Second', 'First'])
  })
})

// ─── softToast.promise() ─────────────────────────────────────────────────────────

describe('softToast.promise()', () => {
  it('resolves: updates toast to success', async () => {
    const id = await softToast.promise(
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
      await softToast.promise(
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

describe('useSoftToast() — flash API methods', () => {
  it('returns flash, showFlashes, hasFlashes methods', () => {
    const t = useSoftToast()
    expect(typeof t.flash).toBe('function')
    expect(typeof t.showFlashes).toBe('function')
    expect(typeof t.hasFlashes).toBe('function')
  })
})

describe('softToast (static) — flash API methods', () => {
  it('softToast.flash is a function', () => {
    expect(typeof softToast.flash).toBe('function')
  })

  it('softToast.showFlashes is a function', () => {
    expect(typeof softToast.showFlashes).toBe('function')
  })

  it('softToast.hasFlashes is a function', () => {
    expect(typeof softToast.hasFlashes).toBe('function')
  })
})
