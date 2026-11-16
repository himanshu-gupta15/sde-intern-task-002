import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** An error that maps directly to an HTTP response of the shape `{ error: message }`. */
export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`)
