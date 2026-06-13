/**
 * 同步诊断报告存储层
 * 负责 weread_sync_reports 的本地缓存读写
 */

import type { WereadSyncReport } from "../../types/syncReport";
import { STORAGE_KEYS, appendWereadSyncReport as appendReport } from "./readingStorage";

const STORAGE_KEY = STORAGE_KEYS.syncReports;

/**
 * 安全加载所有同步报告
 * 读取失败返回空数组，不抛错
 */
export async function loadWereadSyncReports(plugin: any): Promise<WereadSyncReport[]> {
    try {
        const cache = await plugin.loadData(STORAGE_KEY);
        if (Array.isArray(cache)) {
            return cache as WereadSyncReport[];
        }
        return [];
    } catch {
        return [];
    }
}

/**
 * 保存同步报告列表
 */
export async function saveWereadSyncReports(plugin: any, reports: WereadSyncReport[]): Promise<void> {
    try {
        await plugin.saveData(STORAGE_KEY, reports);
    } catch (error) {
        console.error("[syncReportStorage] save failed:", error);
    }
}

/**
 * 追加一条报告并只保留最近 10 次
 */
export async function appendWereadSyncReport(plugin: any, report: WereadSyncReport): Promise<void> {
    await appendReport(plugin, report, 10);
}

/**
 * 获取最近一次同步报告
 * 按 startedAt 降序取第一条
 */
export async function getLatestWereadSyncReport(plugin: any): Promise<WereadSyncReport | null> {
    try {
        const reports = await loadWereadSyncReports(plugin);
        if (reports.length === 0) return null;
        return reports.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0];
    } catch {
        return null;
    }
}
