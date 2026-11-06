import { useEffect, useState } from 'react'
import { clinicNow } from '../utils/clinicDate'

// How often "has it started?" is checked again, so a badge turns into the
// attended/no-show menu without reloading the page.
const CLOCK_TICK_MS = 60_000

// Clinic time (Chile), refreshed every minute: { date: "2026-10-25", time: "16:05" }.
export default function useClinicClock() {
  const [now, setNow] = useState(clinicNow)
  useEffect(() => {
    const id = setInterval(() => setNow(clinicNow()), CLOCK_TICK_MS)
    return () => clearInterval(id)
  }, [])
  return now
}
