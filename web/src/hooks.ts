import { useCallback, useEffect, useState } from 'react'
import { api, type Balance, type Bill, type HomeDetails, type Share } from './api'

export type HomeData = { home: HomeDetails; bills: Bill[]; balances: Balance[] }

export type HomeDataState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  // Once loaded, a failed refresh keeps the old data on screen and reports the error beside it.
  | { status: 'ready'; data: HomeData; refreshing: boolean; refreshError: string | null }

const messageOf = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.')

/** Loads everything the home page shows. Stale or cancelled responses are ignored. */
export function useHomeData(homeId: string) {
  const [state, setState] = useState<HomeDataState>({ status: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadToken is a refetch trigger; bumping it re-runs the effect.
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const isSameHome = (prev: HomeDataState) =>
      prev.status === 'ready' && prev.data.home.id === homeId

    setState((prev) =>
      isSameHome(prev) && prev.status === 'ready'
        ? { ...prev, refreshing: true, refreshError: null }
        : { status: 'loading' },
    )

    Promise.all([
      api.getHome(homeId, signal),
      api.listBills(homeId, signal),
      api.getBalances(homeId, signal),
    ])
      .then(([home, { bills }, { balances }]) => {
        if (signal.aborted) return
        setState({
          status: 'ready',
          data: { home, bills, balances },
          refreshing: false,
          refreshError: null,
        })
      })
      .catch((err: unknown) => {
        if (signal.aborted) return
        const error = messageOf(err)
        setState((prev) =>
          isSameHome(prev) && prev.status === 'ready'
            ? { ...prev, refreshing: false, refreshError: error }
            : { status: 'error', error },
        )
      })

    return () => controller.abort()
  }, [homeId, reloadToken])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  /** Shows a confirmed payment immediately, before the follow-up refresh arrives. */
  const applyPaidShare = useCallback((billId: string, paid: Share) => {
    setState((prev) => {
      if (prev.status !== 'ready') return prev
      const bills = prev.data.bills.map((bill) =>
        bill.id !== billId
          ? bill
          : { ...bill, shares: bill.shares.map((s) => (s.id === paid.id ? paid : s)) },
      )
      return { ...prev, data: { ...prev.data, bills } }
    })
  }, [])

  return { state, reload, applyPaidShare }
}

/** True once `active` has stayed true for `delayMs`. Used for "still loading…" hints. */
export function useIsSlow(active: boolean, delayMs = 2000): boolean {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    setSlow(false)
    if (!active) return
    const timer = setTimeout(() => setSlow(true), delayMs)
    return () => clearTimeout(timer)
  }, [active, delayMs])
  return slow
}

/** Runs an async action, tracking pending state and a displayable error message. */
export function useAction<Args extends unknown[]>(action: (...args: Args) => Promise<void>) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (...args: Args): Promise<boolean> => {
      setPending(true)
      setError(null)
      try {
        await action(...args)
        return true
      } catch (err) {
        setError(messageOf(err))
        return false
      } finally {
        setPending(false)
      }
    },
    [action],
  )

  return { run, pending, error }
}
