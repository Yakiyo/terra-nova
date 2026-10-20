/* Presentation codecs only; scientific calculations remain in src/compute. */
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,
  character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[character]);

export function decodeFloat32(field) {
  const raw = atob(field.data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}
