import { type FormEvent, useCallback, useState } from 'react'
import { api, parseAmountToCents } from '../api'
import { useAction } from '../hooks'

export function CreateHomeForm({ onCreated }: { onCreated: (homeId: string) => void }) {
  const [name, setName] = useState('')
  const create = useCallback(async () => {
    const home = await api.createHome(name)
    onCreated(home.id)
  }, [name, onCreated])
  const { run, pending, error } = useAction(create)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim()) void run()
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <label className="field">
        <span>Home name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Flat 4B"
          maxLength={100}
          required
        />
      </label>
      <button type="submit" className="button" disabled={pending || !name.trim()}>
        {pending ? 'Creating…' : 'Create home'}
      </button>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

export function AddMemberForm({ homeId, onAdded }: { homeId: string; onAdded: () => void }) {
  const [name, setName] = useState('')
  const add = useCallback(async () => {
    await api.addMember(homeId, name)
    setName('')
    onAdded()
  }, [homeId, name, onAdded])
  const { run, pending, error } = useAction(add)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim()) void run()
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <label className="field">
        <span>New member</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Asha"
          maxLength={100}
          required
        />
      </label>
      <button type="submit" className="button" disabled={pending || !name.trim()}>
        {pending ? 'Adding…' : 'Add member'}
      </button>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

type NewBillProps = { homeId: string; disabled: boolean; onCreated: () => void }

export function NewBillForm({ homeId, disabled, onCreated }: NewBillProps) {
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const cents = parseAmountToCents(amount)

  const create = useCallback(async () => {
    if (cents === null) throw new Error('Enter an amount greater than 0 with at most 2 decimals.')
    await api.createBill(homeId, title, cents)
    setTitle('')
    setAmount('')
    onCreated()
  }, [homeId, title, cents, onCreated])
  const { run, pending, error } = useAction(create)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run()
  }

  const amountInvalid = amount.trim() !== '' && cents === null

  return (
    <form className="inline-form" onSubmit={submit}>
      <label className="field">
        <span>Bill</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Electricity"
          maxLength={200}
          required
          disabled={disabled}
        />
      </label>
      <label className="field field-narrow">
        <span>Amount ($)</span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="120.50"
          inputMode="decimal"
          required
          disabled={disabled}
          aria-invalid={amountInvalid}
        />
      </label>
      <button
        type="submit"
        className="button"
        disabled={disabled || pending || !title.trim() || cents === null}
      >
        {pending ? 'Splitting…' : 'Add bill'}
      </button>
      {amountInvalid && (
        <p className="error-text">Enter an amount greater than 0 with at most 2 decimals.</p>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
