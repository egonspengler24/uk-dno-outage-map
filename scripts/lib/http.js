// fetch() with a timeout and a couple of retries for transient failures.
// Error messages include the response body (truncated) but never headers,
// so API keys don't end up in logs.

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export async function fetchWithRetry(url, { headers = {}, timeoutMs = 60_000, retries = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt));
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return res;

      const body = (await res.text()).replace(/\s+/g, " ").slice(0, 200);
      lastError = new Error(`HTTP ${res.status} from ${new URL(url).host}: ${body}`);
      if (!RETRYABLE.has(res.status)) break;
    } catch (err) {
      lastError = new Error(`Request to ${new URL(url).host} failed: ${err.message}`);
    }
  }
  throw lastError;
}
