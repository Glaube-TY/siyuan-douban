import { forwardProxyStrict } from "@/api";
import { WEREAD_API_GATEWAY, WEREAD_API_PROTOCOL_VERSION } from "./constants";
import type { WereadApiName } from "./types";

const NETWORK_ERROR_PATTERNS = /TLS\s*handshake\s*timeout|timeout|i\/o\s*timeout|context\s*deadline\s*exceeded|network|forward\s*request\s*failed|connection\s*reset|connection\s*refused|ECONNRESET|ECONNREFUSED|ETIMEDOUT/i;
const RATE_LIMIT_ERROR_PATTERNS = /请求频率超限|请求过于频繁|频率超限|稍后再试|too many requests|rate[\s-]*limit/i;

export const WEREAD_API_MIN_REQUEST_INTERVAL_MS = 1200;
export const WEREAD_API_RATE_LIMIT_MAX_ATTEMPTS = 4;
export const WEREAD_API_RATE_LIMIT_BASE_DELAY_MS = 10000;
export const WEREAD_API_RATE_LIMIT_MAX_DELAY_MS = 60000;
export const WEREAD_API_RATE_LIMIT_JITTER_MS = 1000;

let requestChain: Promise<void> = Promise.resolve();
let lastRequestStartedAt = 0;
let globalCooldownUntil = 0;

function isNetworkError(message: string): boolean {
  return NETWORK_ERROR_PATTERNS.test(message);
}

export class WereadApiUpgradeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WereadApiUpgradeError";
  }
}

export class WereadApiAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WereadApiAuthError";
  }
}

export class WereadApiError extends Error {
  public readonly errcode: number;
  public readonly retryAfterMs?: number;
  constructor(message: string, errcode: number, retryAfterMs?: number) {
    super(message);
    this.name = "WereadApiError";
    this.errcode = errcode;
    this.retryAfterMs = retryAfterMs;
  }
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function extractRateLimitRetryAfterMs(parsed: unknown): number | undefined {
  if (!parsed || typeof parsed !== "object") return undefined;
  const payload = parsed as Record<string, unknown>;

  for (const key of ["retry_after_ms", "retryAfterMs"]) {
    if (isNonNegativeNumber(payload[key])) return payload[key];
  }
  for (const key of ["retry_after", "retryAfter"]) {
    if (isNonNegativeNumber(payload[key]) && payload[key] <= 3600) return payload[key] * 1000;
  }
  return undefined;
}

export function isWereadRateLimitError(error: unknown): boolean {
  if (error instanceof WereadApiUpgradeError || error instanceof WereadApiAuthError) return false;
  const errorName = typeof error === "object" && error !== null ? String((error as any).name || "") : "";
  if (errorName === "WereadApiUpgradeError" || errorName === "WereadApiAuthError") return false;

  const errorText = typeof error === "object" && error !== null
    ? [
        (error as any).message,
        (error as any).errmsg,
        (error as any).errlog,
      ].filter((value) => value !== undefined && value !== null).join(" ")
    : String(error || "");
  return RATE_LIMIT_ERROR_PATTERNS.test(errorText);
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function getRateLimitBackoffMs(attempt: number): number {
  const exponentialDelay = Math.min(
    WEREAD_API_RATE_LIMIT_MAX_DELAY_MS,
    WEREAD_API_RATE_LIMIT_BASE_DELAY_MS * (2 ** Math.max(0, attempt - 1)),
  );
  return Math.min(
    WEREAD_API_RATE_LIMIT_MAX_DELAY_MS,
    exponentialDelay + Math.floor(Math.random() * (WEREAD_API_RATE_LIMIT_JITTER_MS + 1)),
  );
}

function getRateLimitRetryAfterMs(error: unknown): number | undefined {
  if (error instanceof WereadApiError) return error.retryAfterMs;
  return extractRateLimitRetryAfterMs(error);
}

function scheduleWereadApiRequest<T>(apiName: WereadApiName, request: () => Promise<T>): Promise<T> {
  const scheduled = requestChain.then(async () => {
    for (let attempt = 1; attempt <= WEREAD_API_RATE_LIMIT_MAX_ATTEMPTS; attempt++) {
      const nextRequestAllowedAt = Math.max(
        lastRequestStartedAt + WEREAD_API_MIN_REQUEST_INTERVAL_MS,
        globalCooldownUntil,
      );
      const waitMs = nextRequestAllowedAt - Date.now();
      if (waitMs > 0) await sleep(waitMs);

      lastRequestStartedAt = Date.now();
      try {
        return await request();
      } catch (error) {
        if (!isWereadRateLimitError(error)) throw error;

        const backoffMs = Math.max(
          getRateLimitBackoffMs(attempt),
          getRateLimitRetryAfterMs(error) ?? 0,
        );
        globalCooldownUntil = Math.max(globalCooldownUntil, Date.now() + backoffMs);
        if (attempt >= WEREAD_API_RATE_LIMIT_MAX_ATTEMPTS) throw error;

        console.warn(`[Weread API] ${apiName} rate limited on attempt ${attempt}, retrying after ${backoffMs}ms`);
        await sleep(backoffMs);
      }
    }

    throw new Error("微信读书接口请求次数超出限制");
  });

  requestChain = scheduled.then(() => undefined, () => undefined);
  return scheduled;
}

async function requestWereadApi<T>(apiKey: string, body: Record<string, unknown>): Promise<T> {
  let proxyResult: any;
  try {
    proxyResult = await forwardProxyStrict(
      WEREAD_API_GATEWAY,
      "POST",
      body,
      [
        {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      ],
      30000,
      "application/json"
    );
  } catch (err: any) {
    const rawMsg = String(err?.message || "");
    if (isNetworkError(rawMsg)) {
      throw new Error("微信读书网络连接超时，请检查网络、代理或稍后重试");
    }
    throw new Error(`微信读书接口请求失败：${rawMsg}`);
  }

  let rawBody: unknown = proxyResult;

  if (proxyResult && typeof proxyResult === "object" && "body" in proxyResult) {
    rawBody = (proxyResult as any).body;
  }

  if (rawBody === null || rawBody === undefined || rawBody === "") {
    throw new Error("微信读书接口返回为空");
  }

  let parsed: any;
  if (typeof rawBody === "string") {
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new Error("微信读书接口返回非 JSON");
    }
  } else {
    parsed = rawBody;
  }

  if (parsed.upgrade_info) {
    const upgradeMsg = parsed.upgrade_info.message || "微信读书接口需要升级";
    throw new WereadApiUpgradeError(upgradeMsg);
  }

  if (typeof parsed.errcode === "number" && parsed.errcode !== 0) {
    const code = parsed.errcode;
    if (code === -2013) {
      throw new WereadApiAuthError("微信读书 API Key 鉴权失败");
    }
    const msg = parsed.errmsg || parsed.errlog || `微信读书接口错误：${code}`;
    throw new WereadApiError(msg, code, extractRateLimitRetryAfterMs(parsed));
  }

  return parsed as T;
}

export async function callWereadApi<T = unknown>(
  apiKey: string,
  apiName: WereadApiName,
  params: Record<string, unknown> = {}
): Promise<T> {
  const body = {
    api_name: apiName,
    skill_version: WEREAD_API_PROTOCOL_VERSION,
    ...params,
  };

  return scheduleWereadApiRequest(apiName, () => requestWereadApi<T>(apiKey, body));
}
