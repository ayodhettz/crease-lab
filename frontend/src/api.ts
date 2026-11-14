export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, options);
  if (!response.ok) {
    let message = await response.text();
    try {
      const body = JSON.parse(message);
      message = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* Plain-text errors are supported too. */
    }
    throw new Error(message || `Request failed (${response.status})`);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const json = (value: unknown): RequestInit => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(value),
});
