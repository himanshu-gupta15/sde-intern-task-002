import { Hono } from 'hono'
import { HttpError, notFound } from '../lib/errors'
import { type ShareRow, toShare } from '../lib/types'
import { requireIdempotencyKey } from '../lib/validate'

export const bills = new Hono<{ Bindings: Env }>()

const SHARE_COLUMNS = 'id, bill_id, member_id, amount_cents, paid_at, idempotency_key'

type Nullable<T> = { [K in keyof T]: T[K] | null }

/** The share half of a LEFT JOIN row, or null when no share matched. */
function toShareRow(row: Nullable<ShareRow>): ShareRow | null {
  const { id, bill_id, member_id, amount_cents, paid_at, idempotency_key } = row
  if (id === null || bill_id === null || member_id === null || amount_cents === null) {
    return null
  }
  return { id, bill_id, member_id, amount_cents, paid_at, idempotency_key }
}

bills.post('/:billId/shares/:shareId/pay', async (c) => {
  const db = c.env.DB
  const { billId, shareId } = c.req.param()
  const key = requireIdempotencyKey(c)

  // Compare-and-set: the UPDATE only matches while the share is still unpaid.
  // SQLite executes writes one at a time, so when two requests race exactly one of
  // them changes the row. The loser gets no row back and falls through to the read below.
  const paid = await db
    .prepare(
      `UPDATE shares SET paid_at = ?1, idempotency_key = ?2
       WHERE id = ?3 AND bill_id = ?4 AND paid_at IS NULL
       RETURNING ${SHARE_COLUMNS}`,
    )
    .bind(new Date().toISOString(), key, shareId, billId)
    .first<ShareRow>()

  if (paid) return c.json(toShare(paid), 200)

  // Nothing was updated: the share does not exist, belongs to another bill, or is
  // already paid. Read it to tell these cases apart.
  // One query: the bill row always comes back if the bill exists; the share columns
  // are NULL when the share is missing or belongs to another bill.
  const row = await db
    .prepare(
      `SELECT b.id AS found_bill_id, s.id, s.bill_id, s.member_id, s.amount_cents,
              s.paid_at, s.idempotency_key
       FROM bills b
       LEFT JOIN shares s ON s.bill_id = b.id AND s.id = ?2
       WHERE b.id = ?1`,
    )
    .bind(billId, shareId)
    .first<{ found_bill_id: string } & Nullable<ShareRow>>()

  if (!row) throw notFound('Bill')
  const share = toShareRow(row)
  if (!share) throw notFound('Share')

  // Same key as the request that paid it: a retry. Answer exactly as before.
  if (share.idempotency_key === key) return c.json(toShare(share), 200)

  throw new HttpError(409, 'Share is already paid')
})
