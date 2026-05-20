export function formatReadingDuration(seconds: number): string {
    if (seconds <= 0) {
        return "0 分钟";
    }
    if (seconds < 60) {
        return "不足 1 分钟";
    }
    if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        return `${minutes} 分钟`;
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours} 小时 ${minutes} 分钟`;
}

export function formatReadingCompare(compare?: number): string {
    if (compare === undefined || compare === null) {
        return "";
    }
    const percent = Math.round(Math.abs(compare) * 100);
    if (compare > 0) {
        return `较上期增加 ${percent}%`;
    }
    if (compare < 0) {
        return `较上期减少 ${percent}%`;
    }
    return "与上期持平";
}
