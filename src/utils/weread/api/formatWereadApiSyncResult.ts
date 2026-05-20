import type { WereadApiNormalBooksSyncResult } from "./syncWereadApiNormalBooks";
import type { WereadApiAutoSyncResult } from "./autoSyncWereadApi";

export function formatWereadApiSyncResultSummary(
  result: WereadApiNormalBooksSyncResult,
  options?: { maxTitles?: number }
): string {
  const maxTitles = options?.maxTitles ?? 3;

  const successItems = result.items.filter((i) => i.status === "success");

  const parts: string[] = [];

  if (result.success > 0) {
    const titles = successItems.slice(0, maxTitles).map((i) => i.title).filter(Boolean);
    let titleStr = titles.join("；");
    if (successItems.length > maxTitles) {
      titleStr += ` 等 ${successItems.length - maxTitles} 本`;
    }
    parts.push(`成功 ${result.success}，本次同步：${titleStr}`);
  }

  if (result.failed > 0) {
    parts.push(`失败 ${result.failed}`);
  }

  if (result.success === 0 && result.skippedUnchanged > 0) {
    return `无新变化，${result.skippedUnchanged} 本已是最新`;
  }

  if (result.skippedUnchanged > 0) {
    parts.push(`无变化 ${result.skippedUnchanged} 本`);
  }

  if (parts.length === 0) {
    return "";
  }

  return parts.join("；");
}

export function formatWereadApiAutoSyncResultSummary(
  result: WereadApiAutoSyncResult,
  options?: { maxTitles?: number }
): string {
  const maxTitles = options?.maxTitles ?? 3;

  const normalSuccess = result.normalResult?.success || 0;
  const mpSuccess = result.mpResult?.success || 0;
  const normalFailed = result.normalResult?.failed || 0;
  const mpFailed = result.mpResult?.failed || 0;
  const normalUnchanged = result.normalResult?.skippedUnchanged || 0;
  const mpUnchanged = result.mpResult?.skippedUnchanged || 0;

  const totalSuccess = normalSuccess + mpSuccess;
  const totalFailed = normalFailed + mpFailed;
  const totalUnchanged = normalUnchanged + mpUnchanged;

  if (totalSuccess === 0 && totalUnchanged > 0 && totalFailed === 0) {
    return "无新变化";
  }

  const parts: string[] = [];

  if (totalSuccess > 0) {
    const normalSuccessItems = (result.normalResult?.items || []).filter((i) => i.status === "success");
    const mpSuccessItems = (result.mpResult?.items || []).filter((i) => i.status === "success");

    const allTitles: string[] = [];
    for (const item of normalSuccessItems) {
      if (item.title) allTitles.push(item.title);
    }
    for (const item of mpSuccessItems) {
      if (item.title) allTitles.push(item.title);
    }

    const displayTitles = allTitles.slice(0, maxTitles);
    let titleStr = displayTitles.join("；");
    if (allTitles.length > maxTitles) {
      titleStr += ` 等 ${allTitles.length - maxTitles} 个`;
    }

    const normalPart = normalSuccess > 0 ? `普通书 ${normalSuccess}` : "";
    const mpPart = mpSuccess > 0 ? `公众号 ${mpSuccess}` : "";
    const successDesc = [normalPart, mpPart].filter(Boolean).join("，");

    parts.push(`${successDesc}，${titleStr}`);
  }

  if (totalFailed > 0) {
    parts.push(`失败 ${totalFailed}`);
  }

  if (parts.length === 0) {
    return "";
  }

  return parts.join("；");
}
