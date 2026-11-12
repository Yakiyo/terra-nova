/* Presentation codecs only; scientific calculations remain in src/compute. */
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,
  character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[character]);

/* "12.34° N, 56.78° E" (digits after the point). */
export function formatCoord(lat, lon, digits = 2) {
  return `${Math.abs(lat).toFixed(digits)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(digits)}° ${lon >= 0 ? "E" : "W"}`;
}

/* "top 3.2%" for a percentile of land cells; never claims 0% or 100%. */
export function topShareText(percentile) {
  const top = 100 - percentile;
  if (top < 0.1) return "top 0.1%";
  return `top ${top.toFixed(top < 10 ? 1 : 0)}%`;
}

export function decodeFloat32(field) {
  const raw = atob(field.data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}
