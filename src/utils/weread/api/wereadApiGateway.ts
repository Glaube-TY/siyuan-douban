import { forwardProxyStrict } from "@/api";
import { WEREAD_API_GATEWAY, WEREAD_API_PROTOCOL_VERSION } from "./constants";
import type { WereadApiName } from "./types";

const NETWORK_ERROR_PATTERNS = /TLS\s*handshake\s*timeout|timeout|i\/o\s*timeout|context\s*deadline\s*exceeded|network|forward\s*request\s*failed|connection\s*reset|connection\s*refused|ECONNRESET|ECONNREFUSED|ETIMEDOUT/i;

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
  constructor(message: string, errcode: number) {
    super(message);
    this.name = "WereadApiError";
    this.errcode = errcode;
  }
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
    throw new WereadApiError(msg, code);
  }

  return parsed as T;
}
