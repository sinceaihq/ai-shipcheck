const DEFAULT_TIMEOUT_MS = 5_000;

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}
