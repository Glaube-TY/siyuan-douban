import { callWereadApi } from "./wereadApiGateway";

export function maskWereadApiKey(apiKey: string): string {
  if (!apiKey) return "";
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return "********";
  const last4 = trimmed.slice(-4);
  return `wrk-****${last4}`;
}

export async function validateWereadApiKey(
  apiKey: string
): Promise<{ success: boolean; message: string; verifiedAt?: number }> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return { success: false, message: "API Key 不能为空" };
  }

  try {
    const result = await callWereadApi<Record<string, unknown>>(trimmed, "/shelf/sync");

    if (result && typeof result === "object" && result !== null) {
      const hasShelfFields =
        "books" in result ||
        "albums" in result ||
        "archive" in result ||
        "mp" in result;

      if (hasShelfFields || Object.keys(result).length === 0) {
        const verifiedAt = Date.now();
        return { success: true, message: "API Key 验证成功", verifiedAt };
      }

      return { success: false, message: "API Key 验证失败：返回数据异常" };
    }

    return { success: false, message: "API Key 验证失败：返回数据异常" };
  } catch (error: any) {
    const message = error?.message || "API Key 验证失败";
    return { success: false, message };
  }
}
