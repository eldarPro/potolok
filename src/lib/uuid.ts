// crypto.randomUUID() is restricted to secure contexts (HTTPS or localhost).
// Testing over a plain-HTTP LAN address (e.g. a phone on the same Wi-Fi as
// the dev server) is not a secure context, so that call throws and crashes
// the app before anything renders. crypto.getRandomValues() has no such
// restriction, so fall back to building a v4 UUID from it.
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
