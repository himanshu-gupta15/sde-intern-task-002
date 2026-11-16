/**
 * Splits `totalCents` into `count` integer parts that always add up to the total.
 *
 * Everyone gets the floor of the even share. The leftover cents (always fewer than
 * `count`) go one each to the first parts, so callers must pass members in join order.
 *
 * Example: splitCents(1000, 3) -> [334, 333, 333]
 */
export function splitCents(totalCents: number, count: number): number[] {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new RangeError('totalCents must be a non-negative safe integer')
  }
  if (!Number.isInteger(count) || count <= 0) {
    throw new RangeError('count must be a positive integer')
  }
  const base = Math.floor(totalCents / count)
  const remainder = totalCents % count
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0))
}
