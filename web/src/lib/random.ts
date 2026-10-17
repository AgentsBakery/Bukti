// Randomness for ids and demo jitter, from the platform CSPRNG (never Math.random).

/** Uniform float in [0, 1). */
export function randomFloat(): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] / 0x1_0000_0000
}

/** Integer in [lo, hi], inclusive. */
export function randomInt(lo: number, hi: number): number {
  return lo + Math.floor(randomFloat() * (hi - lo + 1))
}

/** Short lowercase base-36 id, e.g. "k3f9". */
export function randomId(length = 4): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('')
}
