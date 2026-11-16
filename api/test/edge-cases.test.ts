import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { splitCents } from '../src/lib/split'
import { type Balance, type Bill, call, createBill, createHome, type Share } from './helpers'

function pay(billId: string, shareId: string, key: string) {
  return call<Share>('POST', `/api/bills/${billId}/shares/${shareId}/pay`, {
    headers: { 'Idempotency-Key': key },
  })
}

async function billWithShares(names: string[], totalCents: number) {
  const { homeId, members } = await createHome(names)
  const bill = await createBill(homeId, totalCents)
  return { homeId, members, bill: bill.body }
}

describe('splitCents', () => {
  it.each([
    [1000, 3, [334, 333, 333]],
    [1001, 3, [334, 334, 333]],
    [2, 3, [1, 1, 0]],
    [1, 1, [1]],
    [7, 7, [1, 1, 1, 1, 1, 1, 1]],
  ])('splits %i cents between %i members as %j', (total, count, expected) => {
    expect(splitCents(total, count)).toEqual(expected)
  })

  it('always sums to the total', () => {
    for (let count = 1; count <= 13; count++) {
      for (const total of [1, 99, 100, 101, 12345, 999_999_999]) {
        const parts = splitCents(total, count)
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total)
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('input validation', () => {
  it.each([undefined, '', '   ', 42, null])('rejects home name %j', async (name) => {
    const res = await call('POST', '/api/homes', { body: { name } })
    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: expect.any(String) })
  })

  it('rejects a body that is not JSON', async () => {
    const res = await call('POST', '/api/homes', { body: undefined })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String) })
  })

  it('rejects a blank member name', async () => {
    const { homeId } = await createHome([])
    const res = await call('POST', `/api/homes/${homeId}/members`, { body: { name: ' ' } })
    expect(res.status).toBe(422)
  })

  it.each([Number.MAX_SAFE_INTEGER + 1, 1e21, 0.1, -0, true, [100], { cents: 1 }])(
    'rejects the amount %j',
    async (totalCents) => {
      const { homeId } = await createHome(['Asha'])
      const res = await call('POST', `/api/homes/${homeId}/bills`, {
        body: { title: 'Rent', totalCents },
      })
      expect(res.status).toBe(422)
    },
  )

  it('rejects a missing title', async () => {
    const { homeId } = await createHome(['Asha'])
    const res = await call('POST', `/api/homes/${homeId}/bills`, { body: { totalCents: 100 } })
    expect(res.status).toBe(422)
  })

  it('does not create a bill when validation fails', async () => {
    const { homeId } = await createHome([])
    await createBill(homeId, 1000)
    const res = await call<{ bills: Bill[] }>('GET', `/api/homes/${homeId}/bills`)
    expect(res.body.bills).toEqual([])
  })

  it('rejects a blank Idempotency-Key', async () => {
    const { bill } = await billWithShares(['Asha'], 100)
    const res = await pay(bill.id, bill.shares[0]?.id ?? '', '   ')
    expect(res.status).toBe(400)
  })

  it('answers unknown routes with JSON', async () => {
    const res = await call('GET', '/api/nope')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: expect.any(String) })
  })
})

describe('members', () => {
  it('keeps the join order when members are added at the same time', async () => {
    const { homeId } = await createHome([])
    const names = Array.from({ length: 10 }, (_, i) => `Member ${i}`)
    const results = await Promise.all(
      names.map((name) => call('POST', `/api/homes/${homeId}/members`, { body: { name } })),
    )
    expect(results.every((r) => r.status === 201)).toBe(true)

    const bill = await createBill(homeId, 15)
    expect(bill.body.shares).toHaveLength(10)
    expect(bill.body.shares.reduce((sum, s) => sum + s.amountCents, 0)).toBe(15)
  })
})

describe('paying', () => {
  it('lets only one of two concurrent payments with different keys succeed', async () => {
    const { homeId, bill } = await billWithShares(['Asha', 'Ben'], 1000)
    const shareId = bill.shares[0]?.id ?? ''

    const results = await Promise.all([
      pay(bill.id, shareId, crypto.randomUUID()),
      pay(bill.id, shareId, crypto.randomUUID()),
      pay(bill.id, shareId, crypto.randomUUID()),
    ])

    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409])
    const balances = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
    expect(balances.body.balances.map((b) => b.outstandingCents)).toEqual([0, 500])
  })

  it('answers concurrent retries with the same key identically', async () => {
    const { bill } = await billWithShares(['Asha', 'Ben'], 1000)
    const shareId = bill.shares[0]?.id ?? ''
    const key = crypto.randomUUID()

    const results = await Promise.all([pay(bill.id, shareId, key), pay(bill.id, shareId, key)])

    expect(results.map((r) => r.status)).toEqual([200, 200])
    expect(results[0]?.body).toEqual(results[1]?.body)
  })

  it('returns 404 when the share belongs to a different bill', async () => {
    const a = await billWithShares(['Asha'], 100)
    const b = await billWithShares(['Ben'], 100)

    const res = await pay(a.bill.id, b.bill.shares[0]?.id ?? '', crypto.randomUUID())

    expect(res.status).toBe(404)
    const share = await env.DB.prepare('SELECT paid_at FROM shares WHERE id = ?1')
      .bind(b.bill.shares[0]?.id)
      .first<{ paid_at: string | null }>()
    expect(share?.paid_at).toBeNull()
  })

  it('scopes an idempotency key to one share', async () => {
    const { bill } = await billWithShares(['Asha', 'Ben'], 1000)
    const key = crypto.randomUUID()
    const [first, second] = bill.shares

    expect((await pay(bill.id, first?.id ?? '', key)).status).toBe(200)
    expect((await pay(bill.id, second?.id ?? '', key)).status).toBe(200)
    expect((await pay(bill.id, second?.id ?? '', crypto.randomUUID())).status).toBe(409)
  })
})

describe('database constraints', () => {
  it('refuses a non-positive bill total even when the API is bypassed', async () => {
    const { homeId } = await createHome(['Asha'])
    await expect(
      env.DB.prepare(
        "INSERT INTO bills (id, home_id, title, total_cents, created_at) VALUES ('x', ?1, 't', 0, 'now')",
      )
        .bind(homeId)
        .run(),
    ).rejects.toThrow()
  })

  it('refuses a bill for a home that does not exist', async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO bills (id, home_id, title, total_cents, created_at) VALUES ('y', 'nope', 't', 5, 'now')",
      ).run(),
    ).rejects.toThrow()
  })

  it('refuses a paid share without an idempotency key', async () => {
    const { bill } = await billWithShares(['Asha'], 100)
    await expect(
      env.DB.prepare("UPDATE shares SET paid_at = 'now' WHERE id = ?1")
        .bind(bill.shares[0]?.id)
        .run(),
    ).rejects.toThrow()
  })
})
