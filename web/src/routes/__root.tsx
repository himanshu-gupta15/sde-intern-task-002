import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => <Outlet />,
  // Last line of defence: a render error shows a message instead of a blank page.
  errorComponent: ({ error, reset }) => (
    <main className="page">
      <section className="card state state-error" role="alert">
        <h2>Something went wrong</h2>
        <p>{error instanceof Error ? error.message : 'Unexpected error.'}</p>
        <button type="button" className="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  ),
  notFoundComponent: () => (
    <main className="page">
      <section className="card state">
        <h2>Page not found</h2>
        <a href="/">Go to the start page</a>
      </section>
    </main>
  ),
})
