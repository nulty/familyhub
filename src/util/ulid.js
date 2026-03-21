/**
 * utils/ulid.js
 * Minimal ULID implementation — sortable, URL-safe unique IDs.
 * Format: 01ARZ3NDEKTSV4RRFFQ69G5FAV (26 chars, ms-sortable)
 */

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = ENCODING.length;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(now, len) {
  let str = '';
  for (let i = len - 1; i >= 0; i--) {
    str = ENCODING[now % ENCODING_LEN] + str;
    now = Math.floor(now / ENCODING_LEN);
  }
  return str;
}

function encodeRandom(len) {
  let str = '';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (let i = 0; i < len; i++) {
    str += ENCODING[bytes[i] % ENCODING_LEN];
  }
  return str;
}

export function ulid(seedTime = Date.now()) {
  return encodeTime(seedTime, TIME_LEN) + encodeRandom(RANDOM_LEN);
}
