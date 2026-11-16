import type { Context } from 'hono'
import { HttpError } from './errors'

export const NAME_MAX_LENGTH = 100
export const TITLE_MAX_LENGTH = 200
export const IDEMPOTENCY_KEY_MAX_LENGTH = 255

type JsonObject = Record<string, unknown>

/**
 * Reads the request body as a JSON object.
 * Malformed JSON or a non-object body is a client error (400).
 */
export async function readJsonObject(c: Context): Promise<JsonObject> {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object')
  }
  return body as JsonObject
}

/** A required, non-blank string. Returns it trimmed. Invalid values give 422. */
export function requireText(body: JsonObject, field: string, maxLength: number): string {
  const value = body[field]
  if (typeof value !== 'string') {
    throw new HttpError(422, `${field} must be a string`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new HttpError(422, `${field} must not be empty`)
  }
  if (trimmed.length > maxLength) {
    throw new HttpError(422, `${field} must be at most ${maxLength} characters`)
  }
  return trimmed
}

/**
 * A positive whole number of cents. Rejects strings like "1000", decimals, zero,
 * negatives, NaN/Infinity and numbers too large to be represented exactly.
 */
export function requirePositiveCents(body: JsonObject, field: string): number {
  const value = body[field]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new HttpError(422, `${field} must be a positive whole number of cents`)
  }
  return value
}

/** Reads the `Idempotency-Key` header. Missing, blank or oversized keys give 400. */
export function requireIdempotencyKey(c: Context): string {
  const key = c.req.header('Idempotency-Key')?.trim()
  if (!key) {
    throw new HttpError(400, 'Idempotency-Key header is required')
  }
  if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new HttpError(
      400,
      `Idempotency-Key must be at most ${IDEMPOTENCY_KEY_MAX_LENGTH} characters`,
    )
  }
  return key
}
