import { type Bill, formatCents, type Member, type Share } from '../api'
import { type HomeData, useHomeData, useIsSlow } from '../hooks'
import { AddMemberForm, NewBillForm } from './Forms'
import { ShareRow } from './ShareRow'

export function HomeView({ homeId }: { homeId: string }) {
  const { state, reload, applyPaidShare } = useHomeData(homeId)
  const slow = useIsSlow(state.status === 'loading')

  const onPaid = (billId: string, share: Share) => {
    applyPaidShare(billId, share)
    reload() // refresh balances
  }

  if (state.status === 'loading') {
    return (
      <section className="card state" aria-busy="true">
        <div className="spinner" aria-hidden="true" />
        <p>Loading home…</p>
        {slow && <p className="muted">The server is slow to answer. Still trying…</p>}
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section className="card state state-error" role="alert">
        <h2>Could not load this home</h2>
        <p>{state.error}</p>
        <button type="button" className="button" onClick={reload}>
          Try again
        </button>
      </section>
    )
  }

  const { home, balances } = state.data
  return (
    <>
      <header className="home-header">
        <div>
          <h2>{home.name}</h2>
          <p className="muted small">
            Home ID: <code>{home.id}</code>
          </p>
        </div>
        <button
          type="button"
          className="button button-ghost"
          onClick={reload}
          disabled={state.refreshing}
        >
          {state.refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {state.refreshError && (
        <p className="banner banner-error" role="alert">
          Could not refresh: {state.refreshError} Showing the last loaded data.
        </p>
      )}

      <div className="layout">
        <div className="column">
          <BillsSection homeId={home.id} data={state.data} onPaid={onPaid} onCreated={reload} />
        </div>
        <aside className="column">
          <MembersSection homeId={home.id} members={home.members} onAdded={reload} />
          <section className="card">
            <h3>Balances</h3>
            {balances.length === 0 ? (
              <p className="muted">No members yet.</p>
            ) : (
              <ul className="list">
                {balances.map((b) => (
                  <li key={b.memberId} className="row">
                    <span>{b.name}</span>
                    <span className={b.outstandingCents > 0 ? 'amount owes' : 'amount settled'}>
                      {b.outstandingCents > 0 ? formatCents(b.outstandingCents) : 'Settled'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  )
}

type BillsSectionProps = {
  homeId: string
  data: HomeData
  onPaid: (billId: string, share: Share) => void
  onCreated: () => void
}

function BillsSection({ homeId, data, onPaid, onCreated }: BillsSectionProps) {
  const memberNames = new Map(data.home.members.map((m) => [m.id, m.name]))
  const hasMembers = data.home.members.length > 0
  // Newest bill first.
  const bills = [...data.bills].reverse()

  return (
    <section className="card">
      <h3>Bills</h3>
      <NewBillForm homeId={homeId} disabled={!hasMembers} onCreated={onCreated} />
      {!hasMembers && <p className="muted small">Add a member before adding a bill.</p>}

      {bills.length === 0 ? (
        <div className="empty">
          <p>No bills yet.</p>
          <p className="muted small">Bills you add are split between all members.</p>
        </div>
      ) : (
        <ul className="bills">
          {bills.map((bill) => (
            <BillCard key={bill.id} bill={bill} memberNames={memberNames} onPaid={onPaid} />
          ))}
        </ul>
      )}
    </section>
  )
}

type BillCardProps = {
  bill: Bill
  memberNames: Map<string, string>
  onPaid: (billId: string, share: Share) => void
}

function BillCard({ bill, memberNames, onPaid }: BillCardProps) {
  const paidCount = bill.shares.filter((s) => s.paidAt !== null).length
  return (
    <li className="bill">
      <div className="bill-head">
        <strong>{bill.title}</strong>
        <span className="amount">{formatCents(bill.totalCents)}</span>
      </div>
      <p className="muted small">
        {paidCount} of {bill.shares.length} paid
      </p>
      <ul className="shares">
        {bill.shares.map((share) => (
          <ShareRow
            key={share.id}
            billId={bill.id}
            share={share}
            memberName={memberNames.get(share.memberId) ?? 'Unknown member'}
            onPaid={onPaid}
          />
        ))}
      </ul>
    </li>
  )
}

type MembersSectionProps = { homeId: string; members: Member[]; onAdded: () => void }

function MembersSection({ homeId, members, onAdded }: MembersSectionProps) {
  return (
    <section className="card">
      <h3>Members</h3>
      {members.length === 0 ? (
        <p className="muted">No members yet. Add the people who share this home.</p>
      ) : (
        <ol className="list">
          {members.map((m) => (
            <li key={m.id}>{m.name}</li>
          ))}
        </ol>
      )}
      <AddMemberForm homeId={homeId} onAdded={onAdded} />
    </section>
  )
}
