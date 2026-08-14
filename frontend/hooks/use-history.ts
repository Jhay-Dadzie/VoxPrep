import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { historyService } from '@/services/history'
import { HistoryPagination, HistorySort, HistorySummary } from '@/types/history'
import { toAuthError } from '@/services/error-handler'

const PAGE_SIZE = 10
const SEARCH_DEBOUNCE_MS = 350

type LoadMode = 'initial' | 'refresh' | 'more'

export function useHistory() {
  const [items, setItems] = useState<HistorySummary[]>([])
  const [pagination, setPagination] = useState<HistoryPagination | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<HistorySort>('recent')

  // Guards against out-of-order responses: typing quickly fires overlapping
  // requests, and only the newest one may write to state.
  const requestRef = useRef(0)
  const isMountedRef = useRef(true)

  // Mirrors `items` so the optimistic mutations can roll back to the list as
  // it was without taking `items` as a dependency and rebuilding every render.
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  const load = useCallback(
    async (mode: LoadMode, page: number) => {
      const requestId = requestRef.current + 1
      requestRef.current = requestId

      if (mode === 'initial') setIsLoading(true)
      if (mode === 'refresh') setIsRefreshing(true)
      if (mode === 'more') setIsLoadingMore(true)
      setError(null)

      try {
        const result = await historyService.list({ page, limit: PAGE_SIZE, search, sort })

        // A newer request already landed - discard this result.
        if (!isMountedRef.current || requestRef.current !== requestId) return

        setPagination(result.pagination)
        setItems((previous) =>
          mode === 'more' ? [...previous, ...result.data] : result.data
        )
      } catch (err) {
        if (!isMountedRef.current || requestRef.current !== requestId) return
        setError(toAuthError(err).message)
        if (mode !== 'more') setItems([])
      } finally {
        if (isMountedRef.current && requestRef.current === requestId) {
          setIsLoading(false)
          setIsRefreshing(false)
          setIsLoadingMore(false)
        }
      }
    },
    [search, sort]
  )

  // Re-runs whenever the debounced search or sort changes, always from page 1.
  useEffect(() => {
    load('initial', 1)
  }, [load])

  const refresh = useCallback(() => load('refresh', 1), [load])

  const loadMore = useCallback(() => {
    if (isLoading || isLoadingMore || isRefreshing) return
    if (!pagination || pagination.page >= pagination.totalPages) return
    load('more', pagination.page + 1)
  }, [isLoading, isLoadingMore, isRefreshing, pagination, load])

  const setArchived = useCallback(async (id: string, isArchived: boolean) => {
    // Optimistic: the row flips immediately and is rolled back if the call
    // fails, so the list never sits in a pending-looking state.
    setItems((previous) =>
      previous.map((item) => (item.id === id ? { ...item, is_archived: isArchived } : item))
    )

    try {
      await historyService.setArchived(id, isArchived)
    } catch (err) {
      if (isMountedRef.current) {
        setItems((previous) =>
          previous.map((item) => (item.id === id ? { ...item, is_archived: !isArchived } : item))
        )
        setError(toAuthError(err).message)
      }
      throw err
    }
  }, [])

  const remove = useCallback(async (id: string) => {
    const snapshot = itemsRef.current
    setItems((previous) => previous.filter((item) => item.id !== id))

    try {
      await historyService.remove(id)
      setPagination((previous) =>
        previous ? { ...previous, total: Math.max(0, previous.total - 1) } : previous
      )
    } catch (err) {
      if (isMountedRef.current) {
        setItems(snapshot)
        setError(toAuthError(err).message)
      }
      throw err
    }
  }, [])

  return {
    items,
    pagination,
    isLoading,
    isRefreshing,
    isLoadingMore,
    error,
    searchInput,
    setSearchInput,
    sort,
    setSort,
    hasMore: Boolean(pagination && pagination.page < pagination.totalPages),
    refresh,
    loadMore,
    setArchived,
    remove,
    clearError: () => setError(null),
  }
}

/**
 * Read-only summary of the user's recent sessions, for the dashboard.
 *
 * Refetches whenever the screen regains focus so a session finished elsewhere
 * in the app shows up on return without a manual pull-to-refresh.
 */
export function useRecentSessions(displayCount = 3) {
  const [sessions, setSessions] = useState<HistorySummary[]>([])
  const [total, setTotal] = useState(0)
  const [averageScore, setAverageScore] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isMountedRef = useRef(true)

  const load = useCallback(async () => {
    setError(null)
    try {
      // The average has to span every session, not just the page shown here,
      // so it is aggregated server-side rather than derived from `list`.
      const [result, stats] = await Promise.all([
        historyService.list({ page: 1, limit: displayCount, sort: 'recent' }),
        historyService.getStats(),
      ])
      if (!isMountedRef.current) return

      setSessions(result.data)
      setTotal(stats.total_sessions ?? result.pagination?.total ?? result.data.length)
      setAverageScore(stats.average_score)
    } catch (err) {
      if (!isMountedRef.current) return
      setError(toAuthError(err).message)
    } finally {
      if (isMountedRef.current) setIsLoading(false)
    }
  }, [displayCount])

  useFocusEffect(
    useCallback(() => {
      isMountedRef.current = true
      load()
      return () => {
        isMountedRef.current = false
      }
    }, [load])
  )

  return {
    sessions: sessions.slice(0, displayCount),
    total,
    averageScore,
    isLoading,
    error,
    refresh: load,
    hasHistory: sessions.length > 0,
  }
}
