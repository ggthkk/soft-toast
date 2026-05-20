/**
 * Tests for the Flash Message system (useFlash.ts)
 *
 * Flash messages survive page navigation via sessionStorage.
 * We install a Map-backed sessionStorage mock before each test so
 * the functions run in a browser-like environment even under Bun/Node.
 */
import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import { toastStore } from '../stores/toastStore'

// ── sessionStorage mock ───────────────────────────────────────────────────────

const createMockSessionStorage = () => {
  const _store = new Map<string, string>()
  return {
    getItem: (key: string) => _store.get(key) ?? null,
    setItem: (key: string, value: string) => { _store.set(key, value) },
    removeItem: (key: string) => { _store.delete(key) },
    clear: () => { _store.clear() },
    get length() { return _store.size },
    key: (i: number) => [..._store.keys()][i] ?? null,
    _clear: () => _store.clear(),
  }
}

const mockStorage = createMockSessionStorage()

// Install mock BEFORE importing useFlash so that typeof checks inside
// the module functions find a defined sessionStorage.
;(globalThis as Record<string, unknown>).sessionStorage = mockStorage

// Now import — functions will see the mock when called.
// Dynamic import resolves after the globalThis assignment above.
const { queueFlash, consumeFlashes, hasPendingFlashes } = await import('./useFlash')

beforeEach(() => {
  // Clear both the mock store and the toast store between tests
  mockStorage._clear()
  toastStore.clearAll()
})

afterAll(() => {
  // Tidy up the global after all tests in this file
  delete (globalThis as Record<string, unknown>).sessionStorage
})

// ─── queueFlash() ─────────────────────────────────────────────────────────────

describe('queueFlash()', () => {
  it('stores a flash item in sessionStorage', () => {
    queueFlash('Profile saved', { type: 'success' })
    const raw = mockStorage.getItem('@soft-toast/vue:flash')
    expect(raw).not.toBeNull()
    const items = JSON.parse(raw!)
    expect(items.length).toBe(1)
    expect(items[0].title).toBe('Profile saved')
    expect(items[0].options.type).toBe('success')
  })

  it('accumulates multiple flash items', () => {
    queueFlash('First')
    queueFlash('Second')
    const items = JSON.parse(mockStorage.getItem('@soft-toast/vue:flash') || '[]')
    expect(items.length).toBe(2)
    expect(items[0].title).toBe('First')
    expect(items[1].title).toBe('Second')
  })

  it('discards stale items (>30 s) when adding a new one', () => {
    // Manually insert an expired item
    const stale = [{ title: 'Old', options: {}, queuedAt: Date.now() - 31_000 }]
    mockStorage.setItem('@soft-toast/vue:flash', JSON.stringify(stale))

    queueFlash('Fresh')
    const items = JSON.parse(mockStorage.getItem('@soft-toast/vue:flash') || '[]')
    expect(items.length).toBe(1)
    expect(items[0].title).toBe('Fresh')
  })

  it('stores a timestamp (queuedAt)', () => {
    const before = Date.now()
    queueFlash('Timestamped')
    const after = Date.now()
    const item = JSON.parse(mockStorage.getItem('@soft-toast/vue:flash') || '[]')[0]
    expect(item.queuedAt).toBeGreaterThanOrEqual(before)
    expect(item.queuedAt).toBeLessThanOrEqual(after)
  })
})

// ─── consumeFlashes() ─────────────────────────────────────────────────────────

describe('consumeFlashes()', () => {
  it('returns 0 and does nothing when storage is empty', () => {
    const count = consumeFlashes()
    expect(count).toBe(0)
    expect(toastStore.toasts.value.length).toBe(0)
  })

  it('adds toasts for each queued flash', () => {
    queueFlash('Saved!', { type: 'success' })
    queueFlash('Watch out', { type: 'warning' })

    const count = consumeFlashes()
    expect(count).toBe(2)
    expect(toastStore.toasts.value.length).toBe(2)
  })

  it('clears sessionStorage after consuming', () => {
    queueFlash('Gone after consume')
    consumeFlashes()
    const raw = mockStorage.getItem('@soft-toast/vue:flash')
    const items = JSON.parse(raw || '[]')
    expect(items.length).toBe(0)
  })

  it('does not double-show on a second call', () => {
    queueFlash('Once only')
    consumeFlashes()
    const countAgain = consumeFlashes()
    expect(countAgain).toBe(0)
    // Only 1 toast created in total
    expect(toastStore.toasts.value.length).toBe(1)
  })

  it('ignores flash items older than 30 seconds', () => {
    const expired = [{ title: 'Old news', options: {}, queuedAt: Date.now() - 31_000 }]
    mockStorage.setItem('@soft-toast/vue:flash', JSON.stringify(expired))

    const count = consumeFlashes()
    expect(count).toBe(0)
    expect(toastStore.toasts.value.length).toBe(0)
  })

  it('respects the type option from the queued flash', () => {
    queueFlash('Error flash', { type: 'error' })
    consumeFlashes()
    expect(toastStore.toasts.value[0].type).toBe('error')
  })
})

// ─── hasPendingFlashes() ──────────────────────────────────────────────────────

describe('hasPendingFlashes()', () => {
  it('returns false when storage is empty', () => {
    expect(hasPendingFlashes()).toBe(false)
  })

  it('returns true after queueFlash()', () => {
    queueFlash('Pending')
    expect(hasPendingFlashes()).toBe(true)
  })

  it('returns false after consumeFlashes()', () => {
    queueFlash('Will be consumed')
    consumeFlashes()
    expect(hasPendingFlashes()).toBe(false)
  })

  it('returns false if all items are older than 30 seconds', () => {
    const stale = [{ title: 'Old', options: {}, queuedAt: Date.now() - 31_000 }]
    mockStorage.setItem('@soft-toast/vue:flash', JSON.stringify(stale))
    expect(hasPendingFlashes()).toBe(false)
  })
})
