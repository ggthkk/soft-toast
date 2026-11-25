import { gsap } from 'gsap'
import type { AnimationPreset } from '../types'

export const presetConfigs: Record<AnimationPreset, { ease: string; elasticEase: string; duration: number }> = {
  smooth: {
    ease: 'power3.out',
    elasticEase: 'elastic.out(1, 0.5)',
    duration: 0.65
  },
  bouncy: {
    ease: 'back.out(2)',
    elasticEase: 'elastic.out(1.4, 0.45)',
    duration: 0.75
  },
  subtle: {
    ease: 'power2.out',
    elasticEase: 'back.out(1.2)',
    duration: 0.45
  },
  snappy: {
    ease: 'back.out(3)',
    elasticEase: 'elastic.out(1.1, 0.35)',
    duration: 0.5
  }
}

gsap.defaults({ overwrite: 'auto' })

// Mobile devices get snappier animations (35% faster)
const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
const DUR = (s: number) => isTouchDevice ? s * 0.65 : s

export const reduceToastMotion = (element: HTMLElement) =>
  element.closest('[data-soft-toast-motion="reduced"]') !== null ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const QUICK_SETTLE_DURATION = 0.22
const SOFT_SETTLE_EASE = 'power2.out'

export const createElasticEase = (bounce: number) => {
  const amplitude = 0.8 + (bounce * 0.8)
  const period = 0.55 - (bounce * 0.15)
  return `elastic.out(${amplitude.toFixed(2)}, ${period.toFixed(2)})`
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

const cloudSettleAnimation = (
  element: HTMLElement,
  target: {
    y: number
    scale: number
    opacity: number
  }
) => {
  const currentY = Number(gsap.getProperty(element, 'y')) || 0
  const movement = target.y - currentY
  const distance = Math.abs(movement)

  if (distance < 0.5) {
    return gsap.to(element, {
      y: target.y,
      scale: target.scale,
      opacity: target.opacity,
      force3D: true,
      overwrite: true,
      duration: QUICK_SETTLE_DURATION,
      ease: SOFT_SETTLE_EASE
    })
  }

  return gsap.to(element, {
    y: target.y,
    scale: target.scale,
    opacity: target.opacity,
    force3D: true,
    overwrite: true,
    duration: DUR(clamp(0.34 + distance * 0.003, 0.36, 0.46)),
    ease: 'sine.out'
  })
}

export const landingAnimation = (
  element: HTMLElement,
  options: {
    preset?: AnimationPreset
    bounce?: number
    spring?: boolean
    direction?: 'up' | 'down'
  } = {}
) => {
  const { direction = 'up', preset = 'smooth' } = options
  const config = presetConfigs[preset] || presetConfigs.smooth
  const yFrom = direction === 'down' ? -14 : 14
  const landingDuration = DUR(Math.min(config.duration, 0.46))
  const landingEase = preset === 'bouncy' ? 'back.out(1.35)' : SOFT_SETTLE_EASE

  const tl = gsap.timeline()
  
  tl.fromTo(element,
    { y: yFrom, opacity: 0, scale: 0.94 },
    {
      y: 0, opacity: 1, scale: 1,
      duration: landingDuration,
      ease: landingEase,
      transformOrigin: direction === 'down' ? 'top center' : 'bottom center'
    }
  )

  return tl
}

// Morph animation: pill ↔ expanded (fluid expand/collapse)
export const morphAnimation = (
  element: HTMLElement,
  options: { preset?: AnimationPreset; bounce?: number; spring?: boolean } = {}
) => {
  const { preset = 'smooth', bounce = 0.4, spring = true } = options
  const ease = spring ? createElasticEase(bounce) : presetConfigs[preset].ease

  const tl = gsap.timeline()
  tl.to(element, {
    borderRadius: '20px',
    scaleX: 1.015,
    scaleY: 0.98,
    duration: 0.18,
    ease: 'power2.in'
  }).to(element, {
    borderRadius: '20px',
    scaleX: 1, scaleY: 1,
    duration: 0.55,
    ease: ease
  })

  return tl
}

// Leaving cards are already excluded from stack measurements.
export const exitAnimation = (
  element: HTMLElement
) => {
  if (reduceToastMotion(element)) return gsap.set(element, { opacity: 0, overwrite: true })
  const tl = gsap.timeline()
  tl.to(element, {
    scale: 0.85,
    opacity: 0,
    force3D: true,
    overwrite: 'auto',
    duration: 0.2,
    ease: 'power2.out',
  })
  return tl
}

// Swipe exit: fly off horizontally in the direction of the gesture
export const swipeExitAnimation = (
  element: HTMLElement,
  toX: number  // positive = fly right, negative = fly left
) => {
  if (reduceToastMotion(element)) return gsap.set(element, { opacity: 0, overwrite: true })
  return gsap.to(element, {
    x: toX,
    opacity: 0,
    force3D: true,
    overwrite: 'auto',
    duration: 0.28,
    ease: 'power3.out'
  })
}

// Swipe snap-back: elastic spring return to rest position
export const swipeSnapBack = (element: HTMLElement) => {
  return gsap.to(element, {
    x: 0,
    rotate: 0,
    opacity: 1,
    force3D: true,
    overwrite: 'auto',
    duration: DUR(0.45),
    ease: 'elastic.out(1, 0.55)'
  })
}

export const expandAnimation = (element: HTMLElement) =>
  gsap.to(element, { scale: 1.025, duration: 0.25, ease: 'back.out(2)' })

export const collapseAnimation = (element: HTMLElement) =>
  gsap.to(element, { scale: 1, duration: 0.3, ease: 'power2.out' })

// Animate to a stacked-card position. index 0 = front.
// direction: 'up' means the stack peeks upward (bottom-anchored).
// direction: 'down' means the stack peeks downward (top-anchored).
export const positionAnimation = (
  element: HTMLElement,
  options: {
    index: number
    expanded: boolean
    preset?: AnimationPreset
    bounce?: number
    spring?: boolean
    direction?: 'up' | 'down'
    expandedOffset?: number
    liftPx?: number
    scaleStep?: number
    opacityStep?: number
    maxVisible?: number
    reposition?: boolean
    resetSwipe?: boolean
  }
) => {
  const {
    index,
    expanded,
    preset = 'smooth',
    bounce = 0.4,
    spring = true,
    direction = 'up',
    expandedOffset = 0,
    liftPx = 14,
    scaleStep = 0.055,
    opacityStep = 0.2,
    maxVisible = 3,
    reposition = false,
    resetSwipe = false
  } = options

  const config = presetConfigs[preset] || presetConfigs.smooth
  const sign = direction === 'up' ? -1 : 1

  if (reduceToastMotion(element)) {
    const depth = Math.min(index, maxVisible)
    return gsap.set(element, {
      x: 0, rotate: 0,
      y: sign * (expanded ? expandedOffset : depth * liftPx),
      scale: expanded ? 1 : 1 - depth * scaleStep,
      opacity: expanded ? 1 : index >= maxVisible ? 0 : Math.max(0, 1 - depth * opacityStep),
      overwrite: true,
    })
  }

  if (expanded) {
    // Expanded hover and dismiss restacking share one soft settle timing.
    const expandedTarget = {
      x: resetSwipe ? 0 : undefined,
      y: expandedOffset * sign,
      scale: 1,
      opacity: 1,
      rotate: resetSwipe ? 0 : undefined
    }

    if (reposition && spring && !resetSwipe) {
      return cloudSettleAnimation(element, expandedTarget)
    }

    return gsap.to(element, {
      ...expandedTarget,
      force3D: true,
      overwrite: true,
      duration: DUR(resetSwipe ? 0.34 : 0.12),
      ease: resetSwipe ? 'elastic.out(1, 0.55)' : 'power2.out'
    })
  }

  const isHidden = index >= maxVisible
  const clampedIdx = Math.min(index, maxVisible)
  const targetY = clampedIdx * liftPx * sign
  const targetScale = 1 - clampedIdx * scaleStep
  const targetOpacity = isHidden ? 0 : Math.max(0, 1 - clampedIdx * opacityStep)

  if (reposition && spring) {
    if (resetSwipe) {
      return gsap.to(element, {
        x: 0,
        y: targetY,
        scale: targetScale,
        opacity: targetOpacity,
        rotate: 0,
        force3D: true,
        overwrite: true,
        duration: DUR(0.38),
        ease: 'elastic.out(1, 0.55)'
      })
    }

    return cloudSettleAnimation(element, {
      y: targetY,
      scale: targetScale,
      opacity: targetOpacity
    })
  }

  // Initial collapsed stacking keeps the selected preset feel. Repositioning
  // paths above stay softer so hover and dismiss do not feel mismatched.
  const restackEase = spring ? createElasticEase(bounce) : config.ease
  return gsap.to(element, {
    x: resetSwipe ? 0 : undefined,
    y: targetY,
    scale: targetScale,
    opacity: targetOpacity,
    rotate: resetSwipe ? 0 : undefined,
    force3D: true,
    overwrite: resetSwipe ? true : 'auto',
    duration: DUR(resetSwipe ? 0.38 : config.duration * 0.85),
    ease: resetSwipe ? 'elastic.out(1, 0.55)' : restackEase
  })
}

export const progressAnimation = (
  element: HTMLElement,
  duration: number,
  onComplete?: () => void
) =>
  gsap.fromTo(element,
    { scaleX: 1 },
    { scaleX: 0, duration: duration / 1000, ease: 'linear', onComplete }
  )

export const pauseAnimation = (animation: gsap.core.Tween | gsap.core.Timeline) =>
  animation.pause()

export const resumeAnimation = (animation: gsap.core.Tween | gsap.core.Timeline) =>
  animation.play()

export const killAnimations = (element: HTMLElement) =>
  gsap.killTweensOf(element)
