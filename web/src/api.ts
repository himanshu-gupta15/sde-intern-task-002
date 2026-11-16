// Typed client for the bill splitter API. Every call either resolves with typed data or
// rejects with an ApiError carrying a human readable message. It never throws anything else,
// so components can show `error.message` without guessing what went wrong.

export type Home = { id: string; name: string }
export type Member = { id: string; homeId: string; name: string }
export type Share = { id: string; memberId: string; amountCents: number; paidAt: string | null }
export type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  createdAt: string
  shares: Share[]
}
export type Balance = { memberId: string; name: string; outstandingCents: number }
export type HomeDetails = Home & { members: Member[] }

const REQUEST_TIMEOUT_MS = 10_000

export class ApiError extends Error {
  constructor(
    message: string,
    /** HTTP status, or null when no response arrived (offline, timeout). */
    readonly status: number | null,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  // Abort when the caller cancels (e.g. the component unmounts) or when the API is too slow.
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout

  let response: Response
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...options.headers },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    })
  } catch (err) {
    if (timeout.aborted) {
      throw new ApiError('The server took too long to answer. Please try again.', null)
    }
    if (options.signal?.aborted) {
      throw new ApiError('Request cancelled', null)
    }
    throw new ApiError(
      `Could not reach the server${err instanceof Error ? ` (${err.message})` : ''}.`,
      null,
    )
  }

  // A proxy or crashed worker may answer with HTML or nothing at all, so parse defensively.
  const text = await response.text().catch(() => '')
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new ApiError(errorMessage(payload, response.status), response.status)
  }
  if (payload === null) {
    throw new ApiError('The server sent an unreadable answer.', response.status)
  }
  return payload as T
}

function errorMessage(payload: unknown, status: number): string {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'string'
  ) {
    return payload.error
  }
  if (status >= 500) return 'The server had a problem. Please try again.'
  return `Request failed (${status}).`
}

export const api = {
  createHome: (name: string) => request<Home>('/api/homes', { method: 'POST', body: { name } }),

  getHome: (homeId: string, signal?: AbortSignal) =>
    request<HomeDetails>(`/api/homes/${encodeURIComponent(homeId)}`, { signal }),

  addMember: (homeId: string, name: string) =>
    request<Member>(`/api/homes/${encodeURIComponent(homeId)}/members`, {
      method: 'POST',
      body: { name },
    }),

  listBills: (homeId: string, signal?: AbortSignal) =>
    request<{ bills: Bill[] }>(`/api/homes/${encodeURIComponent(homeId)}/bills`, { signal }),

  createBill: (homeId: string, title: string, totalCents: number) =>
    request<Bill>(`/api/homes/${encodeURIComponent(homeId)}/bills`, {
      method: 'POST',
      body: { title, totalCents },
    }),

  getBalances: (homeId: string, signal?: AbortSignal) =>
    request<{ balances: Balance[] }>(`/api/homes/${encodeURIComponent(homeId)}/balances`, {
      signal,
    }),

  payShare: (billId: string, shareId: string, idempotencyKey: string) =>
    request<Share>(
      `/api/bills/${encodeURIComponent(billId)}/shares/${encodeURIComponent(shareId)}/pay`,
      { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } },
    ),
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

/**
 * Parses a user typed amount like "12.34" or "12" into whole cents using string math,
 * so 0.1 + 0.2 style float errors never reach the API. Returns null for invalid input.
 */
export function parseAmountToCents(input: string): number | null {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(input.trim())
  if (!match) return null
  const whole = Number(match[1])
  const fraction = Number((match[2] ?? '').padEnd(2, '0'))
  const cents = whole * 100 + fraction
  return cents > 0 ? cents : null
}
