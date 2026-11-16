// API response shapes (camelCase) and the database rows they come from (snake_case).

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

export type MemberRow = { id: string; home_id: string; name: string }
export type BillRow = {
  id: string
  home_id: string
  title: string
  total_cents: number
  created_at: string
}
export type ShareRow = {
  id: string
  bill_id: string
  member_id: string
  amount_cents: number
  paid_at: string | null
  idempotency_key: string | null
}

export const toMember = (row: MemberRow): Member => ({
  id: row.id,
  homeId: row.home_id,
  name: row.name,
})

export const toShare = (row: ShareRow): Share => ({
  id: row.id,
  memberId: row.member_id,
  amountCents: row.amount_cents,
  paidAt: row.paid_at,
})
