/**
 * Retry a function with exponential backoff.
 *
 * @param {Function} fn - Async function to retry
 * @param {Object} options
 * @param {number} options.retries - Max retry attempts (default: 3)
 * @param {number} options.baseDelay - Base delay in ms (default: 1000)
 * @param {Function} options.onRetry - Callback on each retry(error, attempt)
 */
export async function retry(fn, { retries = 3, baseDelay = 1000, onRetry } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt);
        if (onRetry) onRetry(error, attempt + 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}
