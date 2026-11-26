import { useLayoutEffect } from 'react'
import './useReveal.css'

const EASING = 'cubic-bezier(0.22, 0.8, 0.3, 1)'

// El easing va en cada fotograma para que la curva frene también en el rebote.
const VARIANTS = {
  rise: {
    duration: 600,
    frames: [
      { opacity: 0, transform: 'translateY(64px)', easing: EASING },
      { opacity: 1, transform: 'none' },
    ],
  },
  curve: {
    duration: 800,
    frames: [
      { opacity: 0, transform: 'translate(-56px, 110px) rotate(-7deg)', easing: EASING },
      { offset: 0.65, opacity: 1, transform: 'translate(8px, -12px) rotate(1.5deg)', easing: EASING },
      { opacity: 1, transform: 'none' },
    ],
  },
}

// Entra al verse un 15 %; al subir, sale cuando queda menos de la mitad
// (con menos, la salida casi no se alcanzaría a ver).
const ENTER_RATIO = 0.15
const LEAVE_RATIO = 0.5

// Animación al hacer scroll para los elementos de `rootRef` que cumplen
// `selector`: entran al bajar y, al subir, salen por abajo con el mismo
// movimiento al revés. `variant` es 'rise' o 'curve' y `stagger` el desfase
// en ms entre los que se mueven juntos.
// El estado oculto lo pone este hook: sin JS, sin IntersectionObserver o con
// movimiento reducido, todo se ve de inmediato.
export function useReveal(rootRef, selector, { variant = 'rise', stagger = 90 } = {}) {
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !('IntersectionObserver' in window) || !root.animate) return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    const targets = Array.from(root.querySelectorAll(selector))
    const { duration, frames } = VARIANTS[variant]
    const shown = new Set()
    const running = new Map()

    let lastY = window.scrollY
    let goingUp = false
    const handleScroll = () => {
      if (window.scrollY === lastY) return
      goingUp = window.scrollY < lastY
      lastY = window.scrollY
    }

    // La clase `reveal` mantiene oculto lo que no está en pantalla; mientras
    // dura la animación manda ella, y al terminar no queda ningún transform.
    let observer = null
    const move = (element, entering, delay) => {
      let animation = running.get(element)
      if (animation) {
        // Cambió de sentido a medio camino: se devuelve desde donde está.
        animation.reverse()
      } else {
        animation = element.animate(frames, {
          duration,
          delay: entering ? delay : 0,
          endDelay: entering ? 0 : delay,
          fill: 'both',
        })
        running.set(element, animation)
        if (!entering) animation.reverse()
      }
      animation.onfinish = () => {
        element.classList.toggle('reveal', !shown.has(element))
        animation.cancel()
        running.delete(element)
        // Lo medido en pleno movimiento no vale: se vuelve a medir ya quieto.
        observer.unobserve(element)
        observer.observe(element)
      }
    }

    observer = new IntersectionObserver(
      (entries) => {
        const entering = []
        const leaving = []
        entries.forEach(({ target, intersectionRatio, boundingClientRect, rootBounds }) => {
          const cutBelow = boundingClientRect.bottom > (rootBounds?.bottom ?? window.innerHeight)
          if (shown.has(target)) {
            const focused = target.contains(document.activeElement)
            if (goingUp && cutBelow && intersectionRatio < LEAVE_RATIO && !focused) {
              leaving.push(target)
            }
          } else if (
            // Con la mitad o más a la vista nunca queda oculto.
            intersectionRatio >= LEAVE_RATIO ||
            (intersectionRatio >= ENTER_RATIO && !(goingUp && cutBelow))
          ) {
            entering.push(target)
          }
        })
        entering.forEach((target, position) => {
          shown.add(target)
          move(target, true, position * stagger)
        })
        // Al revés también en el orden: la última en entrar es la primera en irse.
        leaving.forEach((target, position) => {
          shown.delete(target)
          move(target, false, (leaving.length - 1 - position) * stagger)
        })
      },
      { threshold: [0, ENTER_RATIO, LEAVE_RATIO] },
    )

    window.addEventListener('scroll', handleScroll, { passive: true })
    targets.forEach((target) => {
      target.classList.add('reveal')
      observer.observe(target)
    })

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', handleScroll)
      running.forEach((animation) => animation.cancel())
      targets.forEach((target) => target.classList.remove('reveal'))
    }
  }, [rootRef, selector, variant, stagger])
}
