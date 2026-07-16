import type { WereadApiNormalBooksSyncResult } from "./syncWereadApiNormalBooks";
import type { WereadApiAutoSyncResult } from "./autoSyncWereadApi";
import { t } from "../../i18n";

export function formatWereadApiSyncResultSummary(
  result: WereadApiNormalBooksSyncResult,
  options?: { maxTitles?: number; i18nSource?: unknown }
): string {
  const maxTitles = options?.maxTitles ?? 3;

  const successItems = result.items.filter((i) => i.status === "success");

  const parts: string[] = [];

  if (result.success > 0) {
    const titles = successItems.slice(0, maxTitles).map((i) => i.title).filter(Boolean);
    let titleStr = titles.join("；");
    if (successItems.length > maxTitles) {
      titleStr += t(options?.i18nSource, "syncSummaryMoreBooks", " 等 {count} 本", { count: successItems.length - maxTitles });
    }
    parts.push(t(options?.i18nSource, "syncSummarySuccessTitles", "成功 {count}，本次同步：{titles}", { count: result.success, titles: titleStr }));
  }

  if (result.failed > 0) {
    parts.push(t(options?.i18nSource, "syncSummaryFailed", "失败 {count}", { count: result.failed }));
  }

  if (result.success === 0 && result.skippedUnchanged > 0) {
    return t(options?.i18nSource, "syncSummaryNoChangesBooks", "无新变化，{count} 本已是最新", { count: result.skippedUnchanged });
  }

  if (result.skippedUnchanged > 0) {
    parts.push(t(options?.i18nSource, "syncSummaryUnchangedBooks", "无变化 {count} 本", { count: result.skippedUnchanged }));
  }

  if (parts.length === 0) {
    return "";
  }

  return parts.join(t(options?.i18nSource, "uiListSeparator", "；"));
}

export function formatWereadApiAutoSyncResultSummary(
  result: WereadApiAutoSyncResult,
  options?: { maxTitles?: number; i18nSource?: unknown }
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
    return t(options?.i18nSource, "syncSummaryNoChanges", "无新变化");
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
      titleStr += t(options?.i18nSource, "syncSummaryMoreItems", " 等 {count} 个", { count: allTitles.length - maxTitles });
    }

    const normalPart = normalSuccess > 0 ? t(options?.i18nSource, "syncSummaryBooks", "普通书 {count}", { count: normalSuccess }) : "";
    const mpPart = mpSuccess > 0 ? t(options?.i18nSource, "syncSummaryMp", "公众号 {count}", { count: mpSuccess }) : "";
    const successDesc = [normalPart, mpPart].filter(Boolean).join(t(options?.i18nSource, "uiItemSeparator", "，"));

    parts.push(`${successDesc}${t(options?.i18nSource, "uiItemSeparator", "，")}${titleStr}`);
  }

  if (totalFailed > 0) {
    parts.push(t(options?.i18nSource, "syncSummaryFailed", "失败 {count}", { count: totalFailed }));
  }

  if (parts.length === 0) {
    return "";
  }

  return parts.join(t(options?.i18nSource, "uiListSeparator", "；"));
}
