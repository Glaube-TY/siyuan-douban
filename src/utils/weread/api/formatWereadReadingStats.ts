import { t } from "../../i18n";

export function formatReadingDuration(seconds: number, i18nSource?: Record<string, unknown> | null): string {
    if (seconds <= 0) {
        return t(i18nSource, "durationZeroMinutes", "0 分钟");
    }
    if (seconds < 60) {
        return t(i18nSource, "durationLessThanMinute", "不足 1 分钟");
    }
    if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        return t(i18nSource, "durationMinutes", "{minutes} 分钟", { minutes });
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return t(i18nSource, "durationHoursMinutes", "{hours} 小时 {minutes} 分钟", { hours, minutes });
}

export function formatReadingCompare(compare?: number, i18nSource?: Record<string, unknown> | null): string {
    if (compare === undefined || compare === null) {
        return "";
    }
    const percent = Math.round(Math.abs(compare) * 100);
    if (compare > 0) {
        return t(i18nSource, "statsCompareIncrease", "较上期增加 {percent}%", { percent });
    }
    if (compare < 0) {
        return t(i18nSource, "statsCompareDecrease", "较上期减少 {percent}%", { percent });
    }
    return t(i18nSource, "statsCompareSame", "与上期持平");
}
