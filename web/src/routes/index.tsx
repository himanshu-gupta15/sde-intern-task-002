import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useCallback, useState } from 'react'
import { CreateHomeForm } from '../components/Forms'
import { HomeView } from '../components/HomeView'

type Search = { homeId?: string }

export const Route = createFileRoute('/')({
  // The selected home lives in the URL (?homeId=...), so the page can be reloaded or shared.
  validateSearch: (search: Record<string, unknown>): Search => {
    const homeId = typeof search.homeId === 'string' ? search.homeId.trim() : ''
    return homeId ? { homeId } : {}
  },
  component: Page,
})

function Page() {
  const { homeId } = Route.useSearch()
  const navigate = useNavigate({ from: '/' })
  const openHome = useCallback(
    (id: string | undefined) => void navigate({ search: id ? { homeId: id } : {} }),
    [navigate],
  )

  return (
    <main className="page">
      <header className="top">
        <h1>
          <button type="button" className="link" onClick={() => openHome(undefined)}>
            Bill Splitter
          </button>
        </h1>
        <p className="muted">Split shared home bills fairly, to the cent.</p>
      </header>

      {homeId ? (
        // key resets all page state when switching homes.
        <HomeView key={homeId} homeId={homeId} />
      ) : (
        <div className="layout">
          <section className="card">
            <h3>Create a home</h3>
            <CreateHomeForm onCreated={openHome} />
          </section>
          <section className="card">
            <h3>Open a home</h3>
            <OpenHomeForm onOpen={openHome} />
          </section>
        </div>
      )}
    </main>
  )
}

function OpenHomeForm({ onOpen }: { onOpen: (homeId: string) => void }) {
  const [id, setId] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (id.trim()) onOpen(id.trim())
  }
  return (
    <form className="inline-form" onSubmit={submit}>
      <label className="field">
        <span>Home ID</span>
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="Paste a home ID" />
      </label>
      <button type="submit" className="button button-ghost" disabled={!id.trim()}>
        Open
      </button>
    </form>
  )
}
