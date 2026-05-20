/**
 * @soft-toast/vue — Sound Engine
 * Uses the Web Audio API to synthesize tones — zero external file dependencies.
 * Silently no-ops in SSR, when autoplay policy blocks, or when sound is disabled.
 */

import type { ToastType } from '../types'

// Web Audio context (lazy, shared)
let ctx: AudioContext | null = null

// Browser autoplay policy: audio only plays after a user gesture
let userHasInteracted = false

const trackInteraction = () => {
  userHasInteracted = true
}

if (typeof window !== 'undefined') {
  ;(['click', 'keydown', 'pointerdown', 'touchstart'] as const).forEach((evt) =>
    window.addEventListener(evt, trackInteraction, { once: true, passive: true })
  )
}

const getCtx = (): AudioContext | null => {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null
  if (!ctx) ctx = new AudioContext()
  // Resume if suspended (some browsers suspend after inactivity)
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

/**
 * Play a single synthesised note.
 * @param freq       Frequency in Hz
 * @param duration   Duration in seconds
 * @param volume     Amplitude 0–1
 * @param type       Oscillator wave type
 * @param delay      Start offset in seconds (from now)
 */
const playNote = (
  freq: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
  delay = 0
) => {
  const audio = getCtx()
  if (!audio) return

  try {
    const osc = audio.createOscillator()
    const gain = audio.createGain()

    osc.connect(gain)
    gain.connect(audio.destination)

    osc.type = type
    osc.frequency.setValueAtTime(freq, audio.currentTime + delay)

    // Soft attack + exponential decay for a natural feel
    gain.gain.setValueAtTime(0, audio.currentTime + delay)
    gain.gain.linearRampToValueAtTime(volume, audio.currentTime + delay + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + delay + duration)

    osc.start(audio.currentTime + delay)
    osc.stop(audio.currentTime + delay + duration + 0.02)
  } catch {
    // AudioContext can throw in certain sandboxed environments
  }
}

/**
 * Built-in tone profiles — tuned to feel contextually appropriate.
 * success : rising triad  (positive, resolved)
 * error   : falling minor (tense, alarming)
 * warning : double pulse  (attention-grabbing but not harsh)
 * info    : soft chime    (neutral, informational)
 * default : single soft pop
 */
const profiles: Record<ToastType, (vol: number) => void> = {
  success: (vol) => {
    playNote(523.25, 0.12, vol * 0.45, 'sine', 0)      // C5
    playNote(659.25, 0.14, vol * 0.50, 'sine', 0.08)   // E5
    playNote(783.99, 0.20, vol * 0.55, 'sine', 0.16)   // G5
  },
  error: (vol) => {
    playNote(329.63, 0.18, vol * 0.60, 'triangle', 0)    // E4
    playNote(277.18, 0.28, vol * 0.55, 'triangle', 0.12) // C#4
  },
  warning: (vol) => {
    playNote(440.00, 0.14, vol * 0.50, 'sine', 0)     // A4
    playNote(440.00, 0.18, vol * 0.40, 'sine', 0.22)  // A4 (double pulse)
  },
  info: (vol) => {
    playNote(659.25, 0.12, vol * 0.38, 'sine', 0)     // E5
    playNote(880.00, 0.18, vol * 0.42, 'sine', 0.10)  // A5
  },
  default: (vol) => {
    playNote(523.25, 0.15, vol * 0.35, 'sine', 0)     // C5
  },
  // promise → same as info while loading
  promise: (vol) => {
    playNote(523.25, 0.12, vol * 0.30, 'sine', 0)
  },
}

/**
 * Play a sound for the given toast.
 * @param toastType  The semantic toast type
 * @param sound      true = built-in tone, string = custom audio URL, false = silence
 * @param volume     0–1 (clamped)
 */
export const playToastSound = (
  toastType: ToastType,
  sound: boolean | string | undefined,
  volume = 0.5
): void => {
  if (!sound) return
  if (typeof window === 'undefined') return
  if (!userHasInteracted) return  // respect autoplay policy

  const vol = Math.max(0, Math.min(1, volume))

  if (typeof sound === 'string') {
    // Custom audio URL — user supplies their own sound file
    try {
      const audio = new Audio(sound)
      audio.volume = vol
      audio.play().catch(() => {})  // silent fail if policy blocks
    } catch {
      /* noop */
    }
    return
  }

  // Built-in synthesised tone
  const profile = profiles[toastType] ?? profiles.default
  profile(vol)
}
