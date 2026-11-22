import { useCallback, useEffect, useRef, useState } from 'react'
import { CONNECTION_MESSAGE, listErrorMessage, listPhotos } from '../utils/fotosApi'

// Photos of a record (or of the whole patient) from the API, kept only in
// memory. The presigned URLs expire after 10 minutes: when an image fails to
// load, `reportImageError` asks for the list again, once. That allowance comes
// back only when the user does something (`reload`) or the record changes, so
// an image that stays broken can't make a request loop.
//
// canRetryUrls: whether `reportImageError` still has its one new request.
// status: 'idle' (no record yet) | 'loading' | 'ready' | 'error' | 'off'
// ('off': the API answered 404, the feature is turned off).
export default function usePhotoList({ recordId, patientScope = false, onSessionExpired }) {
  // `forId`: the record the state belongs to; for another one it counts as loading.
  const [state, setState] = useState({ forId: null, status: 'loading', photos: [], error: '', retried: false })
  const controllerRef = useRef(null)
  const refetchedRef = useRef(false)
  const expiredRef = useRef(onSessionExpired)

  useEffect(() => {
    expiredRef.current = onSessionExpired
  })

  // Asks for the list and stores the answer. It sets state only after the
  // request answers. quiet: keep what is on screen and say nothing if it fails
  // (the refresh after an expired URL or an upload).
  const run = useCallback(
    async (controller, quiet) => {
      const current = (prev) =>
        prev.forId === recordId
          ? prev
          : { forId: recordId, status: 'loading', photos: [], error: '', retried: false }
      const fail = (text) => {
        if (!quiet) setState((prev) => ({ ...current(prev), status: 'error', error: text }))
      }
      try {
        const result = await listPhotos(recordId, { patientScope, signal: controller.signal })
        if (controller.signal.aborted) return
        if (result.kind === 'ok') {
          setState((prev) => ({
            forId: recordId,
            status: 'ready',
            photos: result.photos,
            error: '',
            retried: prev.forId === recordId && prev.retried,
          }))
        } else if (result.kind === 'off') {
          setState({ forId: recordId, status: 'off', photos: [], error: '', retried: false })
        } else if (result.kind === 'expired') {
          expiredRef.current?.()
          fail('')
        } else {
          fail(listErrorMessage(result.status))
        }
      } catch {
        // Aborted by a newer request or by unmounting: nothing to say.
        if (!controller.signal.aborted) fail(CONNECTION_MESSAGE)
      }
    },
    [recordId, patientScope],
  )

  // A newer request replaces the one in flight.
  const start = useCallback(
    (quiet) => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      return run(controller, quiet)
    },
    [run],
  )

  // The effect below goes through the latest `start` (it changes with the
  // record) without depending on the function itself.
  const startRef = useRef(start)
  useEffect(() => {
    startRef.current = start
  })

  useEffect(() => {
    if (recordId == null) return undefined
    refetchedRef.current = false
    startRef.current(false)
    return () => controllerRef.current?.abort()
  }, [recordId, patientScope])

  const reload = useCallback(() => {
    refetchedRef.current = false
    setState((prev) => ({ ...prev, retried: false }))
    return start(true)
  }, [start])

  // "Reintentar" after an error: back to "loading" first.
  const retry = useCallback(() => {
    refetchedRef.current = false
    setState((prev) => ({ ...prev, forId: recordId, status: 'loading', error: '', retried: false }))
    return start(false)
  }, [recordId, start])

  const reportImageError = useCallback(() => {
    if (refetchedRef.current) return
    refetchedRef.current = true
    setState((prev) => ({ ...prev, retried: true }))
    start(true)
  }, [start])

  const actions = { reload, retry, reportImageError }
  if (recordId == null) return { status: 'idle', photos: [], error: '', canRetryUrls: false, ...actions }
  if (state.forId !== recordId) {
    return { status: 'loading', photos: [], error: '', canRetryUrls: true, ...actions }
  }
  return {
    status: state.status,
    photos: state.photos,
    error: state.error,
    // The list can be asked for again once for expired or missing URLs.
    canRetryUrls: !state.retried,
    ...actions,
  }
}
