/* Bounded, shared terrain requests. Failed requests are never retained. */
const requests = new Map();
const LIMIT = 6;
const TTL = 5 * 60 * 1000;
export function terrainData(site, targetId) {
  const query = new URLSearchParams({ lat: site.lat, lon: site.lon });
  if (targetId) query.set("target_id", targetId);
  const key = query.toString();
  if (requests.has(key)) {
    const value = requests.get(key);
    requests.delete(key);
    if (Date.now() - value.createdAt < TTL) {
      requests.set(key, value);
      return value.request;
    }
  }
  const request = Promise.resolve().then(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch(`/api/site3d?${query}`, { signal: controller.signal });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `Terrain request failed (${response.status}).`);
      }
      return await response.json();
    } catch (error) {
      if (requests.get(key)?.request === request) requests.delete(key);
      throw new Error(error.name === "AbortError" ? "Terrain loading timed out. Try again when the data is available." : error.message);
    } finally { clearTimeout(timer); }
  });
  requests.set(key, { request, createdAt: Date.now() });
  while (requests.size > LIMIT) requests.delete(requests.keys().next().value);
  return request;
}
