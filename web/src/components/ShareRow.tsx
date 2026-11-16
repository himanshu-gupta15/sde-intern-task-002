import { useCallback, useRef } from 'react'
import { api, formatCents, type Share } from '../api'
import { useAction } from '../hooks'

type Props = {
  billId: string
  share: Share
  memberName: string
  onPaid: (billId: string, share: Share) => void
}

export function ShareRow({ billId, share, memberName, onPaid }: Props) {
  // One key per payment attempt, reused on retry. If the first request reached the server
  // but the answer got lost (timeout, 500), the retry is recognised as the same payment
  // and answered 200 instead of paying twice or failing with 409.
  const idempotencyKey = useRef<string | null>(null)

  const pay = useCallback(async () => {
    idempotencyKey.current ??= crypto.randomUUID()
    const paid = await api.payShare(billId, share.id, idempotencyKey.current)
    idempotencyKey.current = null
    onPaid(billId, paid)
  }, [billId, share.id, onPaid])

  const { run, pending, error } = useAction(pay)
  const isPaid = share.paidAt !== null

  return (
    <li className="share">
      <div className="share-main">
        <span className="share-name">{memberName}</span>
        <span className="amount">{formatCents(share.amountCents)}</span>
        {isPaid ? (
          <span className="badge badge-paid" title={share.paidAt ?? undefined}>
            Paid
          </span>
        ) : (
          <button
            type="button"
            className="button button-small"
            onClick={() => void run()}
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? 'Paying…' : error ? 'Retry' : 'Pay'}
          </button>
        )}
      </div>
      {error && !isPaid && (
        <p className="error-text" role="alert">
          Payment failed: {error}
        </p>
      )}
    </li>
  )
}
