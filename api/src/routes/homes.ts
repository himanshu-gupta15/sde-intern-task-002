import { Hono } from 'hono'
import { notFound } from '../lib/errors'
import { splitCents } from '../lib/split'
import {
  type Balance,
  type Bill,
  type BillRow,
  type Home,
  type MemberRow,
  type ShareRow,
  toMember,
  toShare,
} from '../lib/types'
import {
  NAME_MAX_LENGTH,
  readJsonObject,
  requirePositiveCents,
  requireText,
  TITLE_MAX_LENGTH,
} from '../lib/validate'

export const homes = new Hono<{ Bindings: Env }>()

async function requireHome(db: D1Database, homeId: string): Promise<Home> {
  const home = await db
    .prepare('SELECT id, name FROM homes WHERE id = ?1')
    .bind(homeId)
    .first<Home>()
  if (!home) throw notFound('Home')
  return home
}

async function listMembers(db: D1Database, homeId: string): Promise<MemberRow[]> {
  const { results } = await db
    .prepare('SELECT id, home_id, name FROM members WHERE home_id = ?1 ORDER BY position')
    .bind(homeId)
    .all<MemberRow>()
  return results
}

homes.post('/', async (c) => {
  const body = await readJsonObject(c)
  const name = requireText(body, 'name', NAME_MAX_LENGTH)
  const home: Home = { id: crypto.randomUUID(), name }

  await c.env.DB.prepare('INSERT INTO homes (id, name, created_at) VALUES (?1, ?2, ?3)')
    .bind(home.id, home.name, new Date().toISOString())
    .run()

  return c.json(home, 201)
})

homes.get('/:homeId', async (c) => {
  const home = await requireHome(c.env.DB, c.req.param('homeId'))
  const members = await listMembers(c.env.DB, home.id)
  return c.json({ ...home, members: members.map(toMember) })
})

homes.post('/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')
  const body = await readJsonObject(c)
  const name = requireText(body, 'name', NAME_MAX_LENGTH)
  const id = crypto.randomUUID()

  // One statement does three things atomically: checks the home exists (no row is
  // selected otherwise), picks the next join position, and inserts. SQLite runs a
  // single statement as one unit, so two concurrent adds cannot get the same position,
  // and the UNIQUE (home_id, position) constraint backs that up.
  const result = await c.env.DB.prepare(
    `INSERT INTO members (id, home_id, name, position, created_at)
     SELECT ?1, h.id, ?2,
            COALESCE((SELECT MAX(m.position) + 1 FROM members m WHERE m.home_id = h.id), 0),
            ?3
     FROM homes h WHERE h.id = ?4`,
  )
    .bind(id, name, new Date().toISOString(), homeId)
    .run()

  if (result.meta.changes === 0) throw notFound('Home')
  return c.json(toMember({ id, home_id: homeId, name }), 201)
})

homes.get('/:homeId/bills', async (c) => {
  const db = c.env.DB
  const home = await requireHome(db, c.req.param('homeId'))

  const [billsResult, sharesResult] = await db.batch([
    db
      .prepare(
        `SELECT id, home_id, title, total_cents, created_at FROM bills
         WHERE home_id = ?1 ORDER BY created_at, rowid`,
      )
      .bind(home.id),
    db
      .prepare(
        `SELECT s.id, s.bill_id, s.member_id, s.amount_cents, s.paid_at, s.idempotency_key
         FROM shares s
         JOIN bills b ON b.id = s.bill_id
         JOIN members m ON m.id = s.member_id
         WHERE b.home_id = ?1
         ORDER BY m.position`,
      )
      .bind(home.id),
  ])

  const sharesByBill = new Map<string, ShareRow[]>()
  for (const share of (sharesResult?.results ?? []) as ShareRow[]) {
    const list = sharesByBill.get(share.bill_id) ?? []
    list.push(share)
    sharesByBill.set(share.bill_id, list)
  }

  const bills: Bill[] = ((billsResult?.results ?? []) as BillRow[]).map((row) => ({
    id: row.id,
    homeId: row.home_id,
    title: row.title,
    totalCents: row.total_cents,
    createdAt: row.created_at,
    shares: (sharesByBill.get(row.id) ?? []).map(toShare),
  }))

  return c.json({ bills })
})

homes.post('/:homeId/bills', async (c) => {
  const db = c.env.DB
  const homeId = c.req.param('homeId')

  // 404 before 400/422: a missing home is reported even when the body is also wrong.
  await requireHome(db, homeId)
  const body = await readJsonObject(c)
  const title = requireText(body, 'title', TITLE_MAX_LENGTH)
  const totalCents = requirePositiveCents(body, 'totalCents')

  const members = await listMembers(db, homeId)
  if (members.length === 0) {
    return c.json({ error: 'Cannot split a bill in a home with no members' }, 422)
  }

  const amounts = splitCents(totalCents, members.length)
  const createdAt = new Date().toISOString()
  const billId = crypto.randomUUID()
  const shares = members.map((member, index) => ({
    id: crypto.randomUUID(),
    memberId: member.id,
    amountCents: amounts[index] ?? 0,
    paidAt: null,
  }))

  // D1 runs a batch as a single transaction: either the bill and all its shares are
  // stored, or none of them are. A bill can never exist with missing shares.
  await db.batch([
    db
      .prepare(
        'INSERT INTO bills (id, home_id, title, total_cents, created_at) VALUES (?1, ?2, ?3, ?4, ?5)',
      )
      .bind(billId, homeId, title, totalCents, createdAt),
    ...shares.map((share) =>
      db
        .prepare(
          'INSERT INTO shares (id, bill_id, member_id, amount_cents) VALUES (?1, ?2, ?3, ?4)',
        )
        .bind(share.id, billId, share.memberId, share.amountCents),
    ),
  ])

  const bill: Bill = { id: billId, homeId, title, totalCents, createdAt, shares }
  return c.json(bill, 201)
})

homes.get('/:homeId/balances', async (c) => {
  const db = c.env.DB
  const home = await requireHome(db, c.req.param('homeId'))

  const { results } = await db
    .prepare(
      `SELECT m.id AS memberId,
              m.name AS name,
              COALESCE(SUM(CASE WHEN s.paid_at IS NULL THEN s.amount_cents ELSE 0 END), 0)
                AS outstandingCents
       FROM members m
       LEFT JOIN shares s ON s.member_id = m.id
       WHERE m.home_id = ?1
       GROUP BY m.id, m.name, m.position
       ORDER BY m.position`,
    )
    .bind(home.id)
    .all<Balance>()

  return c.json({ balances: results })
})
