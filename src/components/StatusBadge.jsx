import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeftRight, ChevronDown } from 'lucide-react'
import { getStatusMeta, STATUS_META, statusAction } from '../utils/appointmentStatus'
import './DailyAgenda.css'

// Gap between the badge and its menu, and the menu and the window edge (px).
const MENU_GAP = 4
const MENU_MARGIN = 8

// Read-only status pill. Used by the agenda, the table and NextControlSection.
export function StatusBadge({ status }) {
  const statusMeta = getStatusMeta(status)
  if (!statusMeta) return null
  return <span className={`daily-agenda__badge ${statusMeta.className}`}>{statusMeta.label}</span>
}

// The status pill as the only way to change an appointment's status
// (statusAction): a tap switches pendiente <-> confirmada on online bookings
// not started yet; started or already marked ones open a small menu with
// "Atendida" / "No asistió". Anything else is the plain pill.
// `onChange(newStatus)` saves it; `isBusy` while saving (aria-disabled, not
// disabled, so the focus stays on it); `describedBy` names the patient.
export function StatusControl({ appointment, now, isBusy = false, describedBy, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const menuId = useId()
  const action = statusAction(appointment, now)
  const statusMeta = getStatusMeta(appointment?.status)
  const isMenu = action?.kind === 'menu'
  const showMenu = isOpen && isMenu && !isBusy

  const closeMenu = (returnFocus) => {
    setIsOpen(false)
    if (returnFocus) buttonRef.current?.focus()
  }

  // Fixed position under the badge (above it if there is no room), so the
  // list and table containers, which clip their overflow, don't cut it.
  // Written to the DOM before paint (the menu starts hidden by its CSS).
  useLayoutEffect(() => {
    if (!showMenu) return
    const button = buttonRef.current?.getBoundingClientRect()
    const menu = menuRef.current
    if (!button || !menu) return
    const { offsetWidth: width, offsetHeight: height } = menu
    const below = button.bottom + MENU_GAP
    const top =
      below + height + MENU_MARGIN > window.innerHeight
        ? Math.max(MENU_MARGIN, button.top - MENU_GAP - height)
        : below
    const left = Math.min(
      Math.max(MENU_MARGIN, button.right - width),
      window.innerWidth - width - MENU_MARGIN,
    )
    menu.style.top = `${top}px`
    menu.style.left = `${left}px`
    menu.style.visibility = 'visible'
    menu.querySelector('[role="menuitem"]')?.focus()
  }, [showMenu])

  // Closes on a tap outside, and on scroll or resize (the menu is fixed).
  useEffect(() => {
    if (!showMenu) return undefined
    const onPointerDown = (event) => {
      if (menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return
      setIsOpen(false)
    }
    const onScroll = (event) => {
      if (menuRef.current?.contains(event.target)) return
      setIsOpen(false)
    }
    // Only a width change: on phones the address bar hiding fires resize too.
    const openWidth = window.innerWidth
    const onResize = () => {
      if (window.innerWidth !== openWidth) setIsOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [showMenu])

  if (!action || !statusMeta) return <StatusBadge status={appointment?.status} />

  const handleClick = () => {
    if (isBusy) return
    if (action.kind === 'toggle') onChange(action.target)
    else setIsOpen((open) => !open)
  }

  const choose = (status) => {
    closeMenu(true)
    onChange(status)
  }

  const handleMenuKeyDown = (event) => {
    const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]') ?? [])]
    const index = items.indexOf(document.activeElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMenu(true)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      items[(index + step + items.length) % items.length]?.focus()
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus()
    } else if (event.key === 'Tab') {
      // Back on the badge first, so Tab moves on from it instead of from a
      // menu item that no longer exists.
      closeMenu(true)
    }
  }

  // Leaving the menu with the keyboard (to anything but its badge) closes it.
  // No relatedTarget is ignored: Safari and Firefox on macOS/iOS don't focus a
  // tapped button, so tapping an item blurs to nothing before its click
  // arrives. Taps outside are closed by the pointerdown listener instead.
  const handleMenuBlur = (event) => {
    const next = event.relatedTarget
    if (!next || menuRef.current?.contains(next) || buttonRef.current?.contains(next)) return
    setIsOpen(false)
  }

  const label = isBusy
    ? 'Guardando… el cambio de estado'
    : action.kind === 'toggle'
      ? `Estado: ${statusMeta.label}. Cambiar a ${STATUS_META[action.target].label.toLowerCase()}`
      : `Estado: ${statusMeta.label}. Cambiar estado`
  const Icon = isMenu ? ChevronDown : ArrowLeftRight

  return (
    <span className="daily-agenda__status">
      <button
        ref={buttonRef}
        type="button"
        className="daily-agenda__badge-button"
        onClick={handleClick}
        aria-disabled={isBusy || undefined}
        aria-label={label}
        aria-describedby={describedBy}
        aria-haspopup={isMenu ? 'menu' : undefined}
        aria-expanded={isMenu ? showMenu : undefined}
        aria-controls={showMenu ? menuId : undefined}
      >
        <span className={`daily-agenda__badge ${statusMeta.className} daily-agenda__badge--toggle`}>
          {/* Both texts in the same grid cell: the pill is always as wide as
              the longer one, so "Guardando…" doesn't move the row. */}
          <span className="daily-agenda__badge-text">
            <span className={isBusy ? 'daily-agenda__badge-text--hidden' : undefined}>
              {statusMeta.label}
            </span>
            <span className={isBusy ? undefined : 'daily-agenda__badge-text--hidden'}>Guardando…</span>
          </span>
          <Icon className="daily-agenda__badge-icon" size={12} strokeWidth={2.5} aria-hidden="true" />
        </span>
      </button>

      {showMenu && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`Cambiar estado (ahora: ${statusMeta.label})`}
          className="daily-agenda__menu"
          onKeyDown={handleMenuKeyDown}
          onBlur={handleMenuBlur}
        >
          {action.options.map((status) => (
            <button
              key={status}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`daily-agenda__menu-item daily-agenda__menu-item--${status}`}
              onClick={() => choose(status)}
            >
              {STATUS_META[status].label}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
