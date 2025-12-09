export interface RetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
};

export function isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();

    if (
        /econnrefused|econnreset|etimedout|enetunreach|socket hang up|fetch failed/i.test(message)
    ) {
        return true;
    }

    if (/429|rate.?limit|too many requests/i.test(message)) {
        return true;
    }

    if (/^5\d{2}|overloaded|service unavailable|internal server error/i.test(message)) {
        return true;
    }

    if (/incomplete.*tool.*call|possible.*timeout/i.test(message)) {
        return true;
    }

    return false;
}

export function calculateBackoff(
    attempt: number,
    config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
    const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
