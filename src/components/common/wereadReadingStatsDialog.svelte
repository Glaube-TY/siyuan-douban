<script lang="ts">
    import { formatReadingDuration, formatReadingCompare } from "@/utils/weread/api/formatWereadReadingStats";
    import type { WereadReadingDashboard, WereadReadingStatsPeriod } from "@/utils/weread/api/buildWereadApiReadingStats";
    import WereadReadingCategoryRadar from "./wereadReadingCategoryRadar.svelte";

    export let stats: WereadReadingDashboard;
    export let i18n: any;

    type ReadingPeriodMode = "weekly" | "monthly" | "annually" | "overall";

    function i18nText(key: string, fallback = ""): string {
        const value = i18n?.[key];
        return typeof value === "string" ? value : fallback;
    }

    const periodKeys: ReadingPeriodMode[] = ["weekly", "monthly", "annually", "overall"];

    let selectedMode: ReadingPeriodMode = "weekly";
    let selectedPeriod: WereadReadingStatsPeriod | null = null;

    function getPeriod(mode: ReadingPeriodMode): WereadReadingStatsPeriod | null {
        return stats?.[mode] || null;
    }

    function selectPeriod(mode: ReadingPeriodMode) {
        if (!getPeriod(mode)) return;
        selectedMode = mode;
    }

    $: {
        if (!getPeriod(selectedMode)) {
            selectedMode = periodKeys.find((mode) => !!getPeriod(mode)) || "monthly";
        }
        selectedPeriod = getPeriod(selectedMode);
    }

    function getPeriodLabel(mode: ReadingPeriodMode): string {
        const key = "wereadReadingPeriod" + mode.charAt(0).toUpperCase() + mode.slice(1);
        return i18nText(key, mode);
    }

    function formatLoadedAt(ms: number): string {
        const d = new Date(ms);
        const h = String(d.getHours()).padStart(2, "0");
        const m = String(d.getMinutes()).padStart(2, "0");
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${h}:${m}`;
    }

    function formatReadTimeLabel(mode: ReadingPeriodMode, timestampKey: string): string {
        const n = Number(timestampKey);
        if (!Number.isFinite(n)) return timestampKey;

        const ms = n > 1000000000000 ? n : n * 1000;
        const d = new Date(ms);

        if (mode === "annually") {
            return `${d.getMonth() + 1}月`;
        }

        if (mode === "overall") {
            return `${d.getFullYear()}年`;
        }

        return `${d.getMonth() + 1}月${d.getDate()}日`;
    }

    function formatBookMeta(author: string, category: string): string {
        const a = author || i18nText("wereadReadingStatsUnknownAuthor", "未知作者");
        const c = category || "";
        return c ? `${a} · ${c}` : a;
    }

    function formatReadStatName(stat: string): string {
        const lower = stat.toLowerCase();
        if (lower === "read" || lower === "reading") return "阅读";
        if (lower === "finished" || lower === "finish") return "读完";
        if (lower === "note" || lower === "notes") return "笔记";
        if (lower === "readbook" || lower === "book") return "读过";
        return stat;
    }

    function getRecentReadTimes(mode: ReadingPeriodMode, readTimes: Record<string, number>, limit = 12): Array<{ date: string; duration: string }> {
        const entries = Object.entries(readTimes).filter(([, value]) => value > 0);
        const sorted = entries.sort((a, b) => Number(b[0]) - Number(a[0]));
        const recent = sorted.slice(0, limit);
        return recent.map(([key, value]) => ({
            date: formatReadTimeLabel(mode, key),
            duration: formatReadingDuration(value),
        }));
    }

    function buildPreferenceRadarItems(categories: Array<{ title: string; readingTime: number; readingCount: number; }>): Array<{ title: string; readingTime: number; readingCount: number; score: number; radarValue: number; }> {
        if (!categories || categories.length === 0) return [];

        const all = categories.map((c) => ({
            title: c.title,
            readingTime: Number(c.readingTime || 0),
            readingCount: Number(c.readingCount || 0),
        }));

        const totalTime = all.reduce((sum, c) => sum + c.readingTime, 0);
        const totalCount = all.reduce((sum, c) => sum + c.readingCount, 0);

        const scored = all.map((c) => {
            const timeShare = totalTime > 0 ? c.readingTime / totalTime : 0;
            const countShare = totalCount > 0 ? c.readingCount / totalCount : 0;
            const score = 0.75 * timeShare + 0.25 * countShare;
            return { ...c, score };
        });

        const sorted = scored.sort((a, b) => b.score - a.score);
        const top8 = sorted.slice(0, 8);

        const maxScore = Math.max(...top8.map((s) => s.score), 0);

        return top8.map((s) => ({
            title: s.title,
            readingTime: s.readingTime,
            readingCount: s.readingCount,
            score: s.score,
            radarValue: maxScore > 0 ? Math.round((s.score / maxScore) * 100) : 0,
        }));
    }

    $: radarItems = buildPreferenceRadarItems(selectedPeriod?.preferCategory || []);
</script>

<div class="weread-reading-stats-dialog">
    {#if stats.loadedAt}
        <div class="weread-reading-header">
            <div class="weread-reading-updated-at">{i18nText("wereadReadingStatsUpdatedAt", "统计更新时间")}：{formatLoadedAt(stats.loadedAt)}</div>
        </div>
    {/if}

    <div class="weread-reading-summary-grid">
        {#each periodKeys as mode}
            <button
                type="button"
                class="weread-reading-summary-card"
                class:active={selectedMode === mode}
                on:click={() => selectPeriod(mode)}
            >
                <div class="weread-reading-summary-label">{getPeriodLabel(mode)}</div>
                <div class="weread-reading-summary-value">{formatReadingDuration(getPeriod(mode)?.totalReadTime || 0)}</div>
                <div class="weread-reading-summary-sub">{getPeriod(mode)?.readDays || 0} 天</div>
            </button>
        {/each}
    </div>

    {#if selectedPeriod}
        <section class="weread-reading-current-period">
            <div class="weread-reading-current-title">
                {getPeriodLabel(selectedMode)}
                {#if formatReadingCompare(selectedPeriod?.compare)}
                    <span class="weread-reading-compare">{formatReadingCompare(selectedPeriod?.compare)}</span>
                {/if}
            </div>

            <div class="weread-reading-metric-grid">
                <div class="weread-reading-metric-card">
                    <span class="weread-reading-metric-label">{i18nText("wereadReadingStatsTotalTime", "总阅读时长")}</span>
                    <span class="weread-reading-metric-value">{formatReadingDuration(selectedPeriod.totalReadTime || 0)}</span>
                </div>
                <div class="weread-reading-metric-card">
                    <span class="weread-reading-metric-label">{i18nText("wereadReadingStatsReadDays", "阅读天数")}</span>
                    <span class="weread-reading-metric-value">{selectedPeriod.readDays || 0} 天</span>
                </div>
                <div class="weread-reading-metric-card">
                    <span class="weread-reading-metric-label">{i18nText("wereadReadingStatsDailyAverage", "日均阅读")}</span>
                    <span class="weread-reading-metric-value">{formatReadingDuration(selectedPeriod.dayAverageReadTime || 0)}</span>
                </div>
            </div>

            <div class="weread-reading-content-grid">
                <div class="weread-reading-panel">
                    <div class="weread-reading-panel-title">{i18nText("wereadReadingStatsReadDistribution", "阅读分布")}</div>
                    {#if selectedPeriod.readStat && selectedPeriod.readStat.length > 0}
                        {#each selectedPeriod.readStat as item}
                            <div class="weread-reading-list-item">
                                <span>{formatReadStatName(item.stat)}</span>
                                <span>{item.counts}</span>
                            </div>
                        {/each}
                    {:else}
                        <div class="weread-reading-empty">{i18nText("wereadReadingStatsNoRecords", "暂无记录")}</div>
                    {/if}
                </div>

                <div class="weread-reading-panel">
                    <div class="weread-reading-panel-title">{i18nText("wereadReadingStatsRecentReadTimes", "近期阅读记录")}</div>
                    {#if selectedPeriod.readTimes && Object.keys(selectedPeriod.readTimes || {}).length > 0}
                        {#each getRecentReadTimes(selectedMode, selectedPeriod.readTimes || {}) as record}
                            <div class="weread-reading-list-item">
                                <span>{record.date}</span>
                                <span>{record.duration}</span>
                            </div>
                        {/each}
                    {:else}
                        <div class="weread-reading-empty">{i18nText("wereadReadingStatsNoRecords", "暂无记录")}</div>
                    {/if}
                </div>

                <div class="weread-reading-panel weread-reading-panel-books">
                    <div class="weread-reading-panel-title">{i18nText("wereadReadingStatsLongestBooks", "阅读时间较长的书")}</div>
                    {#if selectedPeriod.readLongest && selectedPeriod.readLongest.length > 0}
                        {#each selectedPeriod.readLongest.slice(0, 8) as book}
                            <div class="weread-reading-book-item">
                                {#if book.cover}
                                    <img class="weread-reading-cover" src={book.cover} alt="" />
                                {/if}
                                <div class="weread-reading-book-info">
                                    <span class="weread-reading-book-title">{book.title || i18nText("unnamedBook", "未命名书籍")}</span>
                                    <span class="weread-reading-book-meta">{formatBookMeta(book.author, book.category)}</span>
                                </div>
                                <span class="weread-reading-book-time">{formatReadingDuration(book.readTime)}</span>
                            </div>
                        {/each}
                    {:else}
                        <div class="weread-reading-empty">{i18nText("wereadReadingStatsNoRecords", "暂无记录")}</div>
                    {/if}
                </div>

                <div class="weread-reading-panel weread-reading-panel-preference">
                    <div class="weread-reading-panel-title">{i18nText("wereadReadingStatsPreferCategory", "偏好分类")}</div>
                    {#if selectedPeriod.preferCategory && selectedPeriod.preferCategory.length > 0}
                        <WereadReadingCategoryRadar items={radarItems} {i18n} />
                    {:else}
                        <div class="weread-reading-empty">{i18nText("wereadReadingStatsNoRecords", "暂无记录")}</div>
                    {/if}
                </div>
            </div>
        </section>
    {/if}
</div>
