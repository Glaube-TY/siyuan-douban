<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { showMessage } from "siyuan";
    import type { EChartsCoreOption } from "echarts/core";
    import type { WorkbenchAction } from "../../types/workbench";
    import { buildWereadApiReadingStats } from "../../utils/weread/api/buildWereadApiReadingStats";
    import { formatReadingDuration } from "../../utils/weread/api/formatWereadReadingStats";
    import { loadWereadAuthState } from "../../utils/settings/wereadSettingsService";
    import {
        buildMonthCalendarDays,
        getReadingStatsDashboardView,
        type ReadingCalendarDay,
        type ReadingPeriodMode,
        type ReadingPeriodView,
        type ReadingStatsDashboardView,
    } from "../../utils/readingCenter/readingStatsDashboardData";
    import ReadingStatsChart from "./ReadingStatsChart.svelte";

    export let plugin: any;
    export let refreshKey = 0;
    export let embedded = false;
    export let showBack = true;

    const dispatch = createEventDispatcher<{ back: void; action: WorkbenchAction }>();
    const periodModes: ReadingPeriodMode[] = ["weekly", "monthly", "annually", "overall"];
    const categoryPeriodModes: ReadingPeriodMode[] = ["annually", "overall"];
    const longestBooksPeriodModes: ReadingPeriodMode[] = ["monthly", "annually", "overall"];

    let view: ReadingStatsDashboardView | null = null;
    let loading = true;
    let refreshing = false;
    let hasApiKey = false;
    let errorText = "";
    let lastRefreshKey = refreshKey;
    let activeCalendarMonth = "";
    let selectedCalendarDate = "";
    let readingOverviewMode: ReadingPeriodMode = "weekly";
    let categoryMode: ReadingPeriodMode = "annually";
    let longestBooksMode: ReadingPeriodMode = "annually";

    function getFirstAvailablePeriod(
        view: ReadingStatsDashboardView,
        allowed: ReadingPeriodMode[],
        fallback: ReadingPeriodMode,
    ): ReadingPeriodMode {
        const found = allowed.find((mode) => view.periods?.[mode]);
        return found || fallback;
    }

    onMount(() => {
        loadDashboard();
    });

    async function loadDashboard() {
        loading = true;
        errorText = "";
        try {
            const [nextView, auth] = await Promise.all([
                getReadingStatsDashboardView(plugin),
                loadWereadAuthState(plugin).catch(() => null),
            ]);
            view = nextView;
            if (!activeCalendarMonth) {
                activeCalendarMonth = nextView.currentMonth;
            }
            if (!nextView.periods[readingOverviewMode]) {
                readingOverviewMode = getFirstAvailablePeriod(nextView, ["weekly", "monthly", "annually", "overall"], "annually");
            }
            if (!["annually", "overall"].includes(categoryMode) || !nextView.periods[categoryMode]) {
                categoryMode = getFirstAvailablePeriod(nextView, ["annually", "overall"], "annually");
            }
            if (!["monthly", "annually", "overall"].includes(longestBooksMode) || !nextView.periods[longestBooksMode]) {
                longestBooksMode = getFirstAvailablePeriod(nextView, ["monthly", "annually", "overall"], "annually");
            }
            hasApiKey = !!auth?.apiKey;
        } catch (error: any) {
            console.error("[ReadingStatsCenter] load failed:", error);
            errorText = error?.message || "加载数据中心失败";
            view = null;
        } finally {
            loading = false;
        }
    }

    function selectReadingOverviewMode(mode: ReadingPeriodMode) {
        if (!view?.periods[mode]) return;
        readingOverviewMode = mode;
    }

    function selectCategoryMode(mode: ReadingPeriodMode) {
        if (!view?.periods[mode]) return;
        categoryMode = mode;
    }

    function selectLongestBooksMode(mode: ReadingPeriodMode) {
        if (!view?.periods[mode]) return;
        longestBooksMode = mode;
    }

    async function refreshReadingStats() {
        if (refreshing) return;
        refreshing = true;
        try {
            const auth = await loadWereadAuthState(plugin);
            hasApiKey = !!auth.apiKey;
            if (!auth.apiKey) {
                showMessage("未配置 API Key，请先完成微信读书授权设置");
                return;
            }
            const stats = await buildWereadApiReadingStats(auth.apiKey);
            await plugin.saveData("weread_reading_stats_cache", stats);
            showMessage("阅读统计已刷新");
            await loadDashboard();
        } catch (error: any) {
            console.error("[ReadingStatsCenter] refresh failed:", error);
            showMessage(`刷新阅读统计失败：${error?.message || "未知错误"}`);
        } finally {
            refreshing = false;
        }
    }

    function emitAction(action: WorkbenchAction) {
        dispatch("action", action);
    }

    function formatLoadedAt(ms?: number): string {
        if (!ms) return "尚未生成";
        const date = new Date(ms);
        return date.toLocaleString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function formatSyncTime(ms?: number): string {
        if (!ms) return "暂无同步报告";
        return new Date(ms).toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function shortBookMeta(book: { author: string; category?: string; isAudio?: boolean }): string {
        const parts = [book.author, book.category || (book.isAudio ? "听书" : "")].filter(Boolean);
        return parts.join(" · ") || (book.isAudio ? "听书" : "未知作者");
    }

    function formatAxisDuration(seconds: number): string {
        const value = Number(seconds || 0);
        if (value <= 0) return "0";
        if (value < 3600) return `${Math.round(value / 60)}m`;
        const hours = value / 3600;
        return hours >= 10 ? `${Math.round(hours)}h` : `${Number(hours.toFixed(1))}h`;
    }

    $: metrics = view?.metrics;
    $: yearlyTrendOption = buildYearlyTrendOption(view);
    $: monthlyTrendOption = buildMonthlyTrendOption(view);
    $: rhythmOption = buildRhythmOption(view);
    $: readingOverviewPeriod = view?.periods?.[readingOverviewMode] || null;
    $: categoryPeriod = view?.periods?.[categoryMode] || null;
    $: longestBooksPeriod = view?.periods?.[longestBooksMode] || null;
    $: periodTrendOption = buildPeriodTrendOption(readingOverviewPeriod);
    $: radarOption = buildRadarOption(categoryPeriod?.categoryRadar || []);
    $: calendarDays = view ? buildMonthCalendarDays(view.dailyReadTimes, activeCalendarMonth || view.currentMonth) : [];
    $: calendarMonthKey = activeCalendarMonth || view?.currentMonth || "";
    $: calendarWeekCount = Math.max(...calendarDays.map((item) => item.weekIndex), 0) + 1;
    $: calendarMaxSeconds = Math.max(
        ...calendarDays
            .filter((item) => item.isCurrentMonth && item.seconds > 0)
            .map((item) => item.seconds),
        1,
    );
    $: selectedCalendarDay = calendarDays.find((item) => item.date === selectedCalendarDate);
    $: calendarMonthDays = calendarDays.filter((item) => item.isCurrentMonth);
    $: calendarMonthTotalSeconds = calendarMonthDays.reduce((sum, item) => sum + item.seconds, 0);
    $: calendarMonthActiveDays = calendarMonthDays.filter((item) => item.seconds > 0).length;

    $: if (refreshKey !== lastRefreshKey) {
        lastRefreshKey = refreshKey;
        if (!loading) {
            loadDashboard();
        }
    }

    function baseGrid() {
        return { left: 10, right: 12, top: 18, bottom: 12, containLabel: true };
    }

    function buildYearlyTrendOption(data: ReadingStatsDashboardView | null): EChartsCoreOption | null {
        const rows = data?.yearlyTrend || [];
        if (rows.length === 0) return null;
        return {
            tooltip: {
                trigger: "axis",
                formatter: (params: any) => {
                    const item = Array.isArray(params) ? params[0] : params;
                    return `${item?.name || ""}<br/>阅读时长：${formatReadingDuration(item?.value || 0)}`;
                },
            },
            grid: baseGrid(),
            xAxis: {
                type: "value",
                minInterval: 60,
                splitNumber: 4,
                axisLabel: { formatter: formatAxisDuration },
            },
            yAxis: { type: "category", data: rows.map((item) => item.year), inverse: true, axisLabel: { hideOverlap: true } },
            series: [{
                type: "bar",
                data: rows.map((item) => item.seconds),
                barWidth: 10,
                itemStyle: { borderRadius: [0, 6, 6, 0] },
            }],
        };
    }

    function buildPeriodTrendOption(period: ReadingPeriodView | null): EChartsCoreOption | null {
        const rows = period?.readTimesTrend || [];
        if (rows.length === 0 || rows.every((item) => item.seconds <= 0)) return null;
        return {
            tooltip: {
                trigger: "axis",
                formatter: (params: any) => {
                    const item = Array.isArray(params) ? params[0] : params;
                    const row = rows[item?.dataIndex || 0];
                    return `${row?.label || item?.name || ""}<br/>阅读时长：${row?.duration || formatReadingDuration(item?.value || 0)}`;
                },
            },
            grid: baseGrid(),
            xAxis: {
                type: "category",
                data: rows.map((item) => item.label),
                axisLabel: {
                    interval: rows.length > 12 ? "auto" : 0,
                    hideOverlap: true,
                },
            },
            yAxis: {
                type: "value",
                minInterval: 60,
                splitNumber: 4,
                axisLabel: { formatter: formatAxisDuration },
            },
            series: [{
                type: "bar",
                data: rows.map((item) => item.seconds),
                barMaxWidth: 16,
                itemStyle: { borderRadius: [5, 5, 0, 0] },
            }],
        };
    }

    function buildMonthlyTrendOption(data: ReadingStatsDashboardView | null): EChartsCoreOption | null {
        const rows = data?.annualMonthlyTrend || [];
        if (rows.length === 0 || rows.every((item) => item.seconds <= 0)) return null;
        return {
            tooltip: {
                trigger: "axis",
                formatter: (params: any) => {
                    const item = Array.isArray(params) ? params[0] : params;
                    return `${item?.name || ""}<br/>阅读时长：${formatReadingDuration(item?.value || 0)}`;
                },
            },
            grid: baseGrid(),
            xAxis: { type: "category", data: rows.map((item) => item.month), axisLabel: { hideOverlap: true } },
            yAxis: {
                type: "value",
                minInterval: 60,
                splitNumber: 4,
                axisLabel: { formatter: formatAxisDuration },
            },
            series: [{
                type: "bar",
                data: rows.map((item) => item.seconds),
                barMaxWidth: 18,
                itemStyle: { borderRadius: [6, 6, 0, 0] },
            }],
        };
    }

    function buildRhythmOption(data: ReadingStatsDashboardView | null): EChartsCoreOption | null {
        const rows = data?.rhythm || [];
        if (rows.length === 0) return null;
        return {
            tooltip: {
                trigger: "axis",
                formatter: (params: any) => {
                    const item = Array.isArray(params) ? params[0] : params;
                    return `${item?.name || ""}<br/>阅读时长：${formatReadingDuration(item?.value || 0)}`;
                },
            },
            grid: baseGrid(),
            xAxis: {
                type: "category",
                data: rows.map((item) => item.day),
                boundaryGap: true,
                axisLabel: {
                    interval: (index: number) => index === 0 || index === rows.length - 1 || index % 5 === 0,
                    hideOverlap: true,
                },
            },
            yAxis: {
                type: "value",
                minInterval: 60,
                splitNumber: 4,
                axisLabel: { formatter: formatAxisDuration },
            },
            series: [
                {
                    name: "日阅读",
                    type: "bar",
                    data: rows.map((item) => item.seconds),
                    barMaxWidth: 10,
                    itemStyle: { borderRadius: [4, 4, 0, 0] },
                },
                {
                    name: "节奏",
                    type: "line",
                    data: rows.map((item) => item.seconds),
                    smooth: true,
                    symbolSize: 5,
                },
            ],
        };
    }

    function buildRadarOption(rows: ReadingPeriodView["categoryRadar"]): EChartsCoreOption | null {
        if (rows.length === 0) return null;
        return {
            tooltip: {
                formatter: (params: any) => {
                    const values = params?.value || [];
                    return rows.map((item, index) => `${item.name}：${values[index] || 0}%`).join("<br/>");
                },
            },
            radar: {
                radius: "58%",
                center: ["50%", "54%"],
                indicator: rows.map((item) => ({ name: item.name, max: 100 })),
            },
            series: [{
                type: "radar",
                data: [{ value: rows.map((item) => item.value), name: "偏好强度" }],
                areaStyle: { opacity: 0.16 },
            }],
        };
    }

    function heatLevel(seconds: number, maxSeconds: number): number {
        if (seconds <= 0 || maxSeconds <= 0) return 0;
        const ratio = seconds / maxSeconds;
        if (ratio < 0.2) return 1;
        if (ratio < 0.45) return 2;
        if (ratio < 0.75) return 3;
        return 4;
    }

    function formatCalendarMonth(monthKey: string): string {
        const matched = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
        if (!matched) return "本月";
        return `${matched[1]}年${Number(matched[2])}月`;
    }

    function currentMonthKey(): string {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }

    function shiftCalendarMonth(offset: number) {
        const key = calendarMonthKey || currentMonthKey();
        const matched = key.match(/^(\d{4})-(\d{2})$/);
        const base = matched
            ? new Date(Number(matched[1]), Number(matched[2]) - 1, 1)
            : new Date();
        base.setMonth(base.getMonth() + offset);
        const nextKey = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
        if (offset > 0 && nextKey > currentMonthKey()) return;
        activeCalendarMonth = nextKey;
        selectedCalendarDate = "";
    }

    function isCurrentOrFutureMonth(monthKey: string): boolean {
        return String(monthKey || currentMonthKey()) >= currentMonthKey();
    }

    function selectCalendarDay(day: ReadingCalendarDay) {
        selectedCalendarDate = day.date;
    }
</script>

<div class="reading-stats-center" class:embedded>
    <header class="reading-stats-header">
        {#if showBack}
            <button class="reading-stats-back" type="button" on:click={() => dispatch("back")}>返回</button>
        {/if}
        <div class="reading-stats-title-area">
            <h1>微信读书数据中心</h1>
            <p>从本地缓存汇总阅读统计、笔记资产和最近同步覆盖情况</p>
            <span>更新时间：{formatLoadedAt(view?.loadedAt)}</span>
        </div>
        <div class="reading-stats-actions">
            <button class="reading-stats-secondary" type="button" on:click={() => emitAction("open-weread-auth")}>授权设置</button>
            <button class="reading-stats-primary" type="button" disabled={refreshing} on:click={refreshReadingStats}>
                {refreshing ? "刷新中..." : "刷新阅读统计"}
            </button>
        </div>
    </header>

    {#if loading}
        <div class="reading-stats-loading">
            <div class="reading-stats-spinner"></div>
            <span>加载数据中心...</span>
        </div>
    {:else if errorText}
        <div class="reading-stats-empty">
            <strong>数据中心加载失败</strong>
            <span>{errorText}</span>
            <button type="button" on:click={loadDashboard}>重新加载</button>
        </div>
    {:else if !view?.hasStats}
        <div class="reading-stats-empty">
            <strong>暂无阅读统计缓存</strong>
            <span>{hasApiKey ? "点击刷新阅读统计后，将只更新阅读统计缓存，不会触发笔记同步。" : "当前未配置 API Key，请先进入授权设置后再刷新阅读统计。"}</span>
            <div class="reading-stats-empty-actions">
                <button type="button" on:click={refreshReadingStats} disabled={refreshing}>{refreshing ? "刷新中..." : "刷新阅读统计"}</button>
                <button type="button" on:click={() => emitAction("open-weread-auth")}>授权设置</button>
            </div>
        </div>
    {:else if view && metrics}
        <section class="reading-stats-metrics" aria-label="阅读指标">
            <div class="metric-card">
                <span>笔记数</span>
                <strong>{metrics.noteCount}</strong>
                <em>本地缓存</em>
            </div>
            <div class="metric-card">
                <span>书架数量</span>
                <strong>{metrics.shelfTotal}</strong>
                <em>{metrics.normalBooks} 本书 / {metrics.mpAccounts} 公众号</em>
            </div>
            <button class="metric-card" type="button" on:click={() => emitAction("open-inbox")}>
                <span>未处理新增</span>
                <strong>{metrics.pendingInbox}</strong>
                <em>打开收件箱</em>
            </button>
        </section>

        <section class="stats-panel stats-panel-full reading-overview-panel" aria-label="阅读概况">
            <div class="stats-panel-head">
                <div>
                    <h2>阅读概况</h2>
                    <span>{readingOverviewPeriod?.label || "当前"}统计、分布与近期记录</span>
                </div>
                <div class="period-switch" aria-label="阅读概况口径">
                    {#each periodModes as mode}
                        <button
                            type="button"
                            class:active={readingOverviewMode === mode}
                            disabled={!view.periods[mode]}
                            on:click={() => selectReadingOverviewMode(mode)}
                        >{view.periods[mode]?.label || mode}</button>
                    {/each}
                </div>
            </div>
            {#if readingOverviewPeriod}
                <div class="period-overview-grid">
                    <div>
                        <span>总阅读时长</span>
                        <strong>{readingOverviewPeriod.totalReadTimeText}</strong>
                    </div>
                    <div>
                        <span>阅读天数</span>
                        <strong>{readingOverviewPeriod.readDays} 天</strong>
                    </div>
                    <div>
                        <span>日均阅读</span>
                        <strong>{readingOverviewPeriod.dayAverageReadTimeText}</strong>
                    </div>
                    <div>
                        <span>今日阅读</span>
                        <strong>{metrics.todayReadTimeText}</strong>
                    </div>
                </div>
                {#if readingOverviewPeriod.compareText}
                    <div class="period-compare">{readingOverviewPeriod.compareText}</div>
                {/if}
                <div class="overview-detail-grid">
                    <div>
                        <div class="sub-panel-title">阅读分布</div>
                        {#if readingOverviewPeriod.readDistribution.length}
                            <div class="period-list">
                                {#each readingOverviewPeriod.readDistribution as item}
                                    <div>
                                        <span>{item.name}</span>
                                        <strong>{item.value}</strong>
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <div class="panel-empty panel-empty-compact">暂无阅读分布</div>
                        {/if}
                    </div>
                    <div>
                        <div class="sub-panel-title">近期阅读记录</div>
                        {#if readingOverviewPeriod.recentReadTimes.length}
                            <div class="period-list">
                                {#each readingOverviewPeriod.recentReadTimes as item}
                                    <div>
                                        <span>{item.date}</span>
                                        <strong>{item.duration}</strong>
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <div class="panel-empty panel-empty-compact">暂无近期阅读记录</div>
                        {/if}
                    </div>
                </div>
            {:else}
                <div class="panel-empty">当前概况口径暂无数据</div>
            {/if}
        </section>

        <main class="reading-stats-grid">
            <section class="stats-panel stats-panel-wide">
                <div class="stats-panel-head">
                    <h2>{readingOverviewPeriod?.label || "当前"}趋势</h2>
                    <span>跟随阅读概况口径</span>
                </div>
                {#if periodTrendOption}
                    <ReadingStatsChart option={periodTrendOption} height={220} />
                {:else}
                    <div class="panel-empty">暂无阅读明细趋势数据</div>
                {/if}
            </section>

            <section class="stats-panel stats-panel-wide">
                <div class="stats-panel-head">
                    <h2>年度阅读趋势</h2>
                    <span>按年份汇总总阅读时长</span>
                </div>
                {#if yearlyTrendOption}
                    <ReadingStatsChart option={yearlyTrendOption} height={220} />
                {:else}
                    <div class="panel-empty">暂无年度趋势数据</div>
                {/if}
            </section>

            <section class="stats-panel">
                <div class="stats-panel-head">
                    <h2>月度阅读热力</h2>
                    <span>阅读热力日历</span>
                </div>
                {#if calendarDays.length > 0}
                    <div class="reading-calendar-heatmap" aria-label="月度阅读热力图">
                        <div class="calendar-heatmap-toolbar">
                            <button type="button" aria-label="上个月" on:click={() => shiftCalendarMonth(-1)}>‹</button>
                            <strong>{formatCalendarMonth(calendarMonthKey)}</strong>
                            <button
                                type="button"
                                aria-label="下个月"
                                disabled={isCurrentOrFutureMonth(calendarMonthKey)}
                                on:click={() => shiftCalendarMonth(1)}
                            >›</button>
                        </div>

                        <div class="calendar-heatmap-weekdays" aria-hidden="true">
                            <span>日</span>
                            <span>一</span>
                            <span>二</span>
                            <span>三</span>
                            <span>四</span>
                            <span>五</span>
                            <span>六</span>
                        </div>

                        <div class="calendar-heatmap-grid" style={`--calendar-weeks: ${calendarWeekCount};`}>
                            {#each calendarDays as item}
                                <button
                                    type="button"
                                    class={`calendar-heatmap-cell heat-level-${heatLevel(item.seconds, calendarMaxSeconds)}`}
                                    class:out-month={!item.isCurrentMonth}
                                    class:today={item.isToday}
                                    class:selected={selectedCalendarDate === item.date}
                                    style={`grid-column: ${item.weekday + 1}; grid-row: ${item.weekIndex + 1};`}
                                    title={`${item.date}：阅读 ${item.label}`}
                                    aria-label={`${item.date}：阅读 ${item.label}`}
                                    on:click={() => selectCalendarDay(item)}
                                >
                                    <span>{item.day}</span>
                                </button>
                            {/each}
                        </div>

                        <div class="calendar-heatmap-footer">
                            <div class="calendar-heatmap-summary">
                                {#if selectedCalendarDay}
                                    <strong>{selectedCalendarDay.date}</strong>
                                    <span>阅读 {selectedCalendarDay.label}</span>
                                {:else}
                                    <strong>本月累计 {formatReadingDuration(calendarMonthTotalSeconds)}</strong>
                                    <span>阅读 {calendarMonthActiveDays} 天</span>
                                {/if}
                            </div>
                            <div class="calendar-heatmap-legend" aria-hidden="true">
                                <span>低</span>
                                {#each [0, 1, 2, 3, 4] as level}
                                    <i class={`calendar-heatmap-swatch heat-level-${level}`}></i>
                                {/each}
                                <span>高</span>
                            </div>
                        </div>
                    </div>
                {:else}
                    <div class="panel-empty">暂无月度阅读记录</div>
                {/if}
            </section>

            <section class="stats-panel">
                <div class="stats-panel-head">
                    <h2>年度月份</h2>
                    <span>1-12 月阅读时长</span>
                </div>
                {#if monthlyTrendOption}
                    <ReadingStatsChart option={monthlyTrendOption} height={230} />
                {:else}
                    <div class="panel-empty">暂无年度月份数据</div>
                {/if}
            </section>

            <section class="stats-panel">
                <div class="stats-panel-head">
                    <h2>阅读节奏</h2>
                    <span>最近阅读的日变化</span>
                </div>
                {#if rhythmOption}
                    <ReadingStatsChart option={rhythmOption} height={230} />
                {:else}
                    <div class="panel-empty">暂无节奏数据</div>
                {/if}
            </section>

            <section class="stats-panel">
                <div class="stats-panel-head">
                    <h2>分类雷达</h2>
                    <div class="period-switch" aria-label="分类雷达范围">
                        {#each categoryPeriodModes as mode}
                            <button
                                type="button"
                                class:active={categoryMode === mode}
                                disabled={!view.periods[mode]}
                                on:click={() => selectCategoryMode(mode)}
                            >{view.periods[mode]?.label || mode}</button>
                        {/each}
                    </div>
                </div>
                {#if radarOption}
                    <ReadingStatsChart option={radarOption} height={250} />
                {:else}
                    <div class="panel-empty">暂无分类雷达数据</div>
                {/if}
            </section>

            <section class="stats-panel stats-panel-books">
                <div class="stats-panel-head">
                    <h2>阅读时间较长的书</h2>
                    <div class="period-switch" aria-label="阅读时间较长的书口径">
                        {#each longestBooksPeriodModes as mode}
                            <button
                                type="button"
                                class:active={longestBooksMode === mode}
                                disabled={!view.periods[mode]}
                                on:click={() => selectLongestBooksMode(mode)}
                            >{view.periods[mode]?.label || mode}</button>
                        {/each}
                    </div>
                </div>
                {#if longestBooksPeriod?.longestBooks.length}
                    <div class="longest-book-list">
                        {#each longestBooksPeriod.longestBooks as book}
                            <article class="longest-book-item">
                                {#if book.cover}
                                    <img src={book.cover} alt="" />
                                {:else}
                                    <div class="book-cover-placeholder" aria-hidden="true">书</div>
                                {/if}
                                <div>
                                    <strong>{book.title}</strong>
                                    <span>{shortBookMeta(book)}</span>
                                    {#if book.tags?.length}
                                        <span>{book.tags[0]}</span>
                                    {/if}
                                </div>
                                <em>{book.readTimeText}</em>
                            </article>
                        {/each}
                    </div>
                {:else}
                    <div class="panel-empty">暂无书籍阅读时长数据</div>
                {/if}
            </section>

            <section class="stats-panel stats-panel-coverage">
                <div class="stats-panel-head">
                    <h2>同步覆盖</h2>
                    <span>最近同步与本地索引</span>
                </div>
                <div class="coverage-grid">
                    <button type="button" on:click={() => emitAction("open-diagnostics")}>
                        <span>最近同步</span>
                        <strong>{formatSyncTime(view.syncCoverage.latestSyncTime)}</strong>
                        <em>成功 {view.syncCoverage.successCount} / 失败 {view.syncCoverage.failedCount} / 跳过 {view.syncCoverage.skippedCount}</em>
                    </button>
                    <div>
                        <span>块级新增</span>
                        <strong>{view.syncCoverage.latestAdded}</strong>
                        <em>最近报告</em>
                    </div>
                    <div>
                        <span>块级更新</span>
                        <strong>{view.syncCoverage.latestChanged}</strong>
                        <em>最近报告</em>
                    </div>
                    <div>
                        <span>块级删除</span>
                        <strong>{view.syncCoverage.latestDeleted}</strong>
                        <em>最近报告</em>
                    </div>
                    <button type="button" on:click={() => emitAction("open-diagnostics")}>
                        <span>索引覆盖</span>
                        <strong>{metrics.indexedSources}</strong>
                        <em>{metrics.indexedItems} 个同步单元</em>
                    </button>
                    <button type="button" on:click={() => emitAction("open-unbound-books")}>
                        <span>未绑定书籍</span>
                        <strong>{metrics.unboundBooks}</strong>
                        <em>打开未绑定页面</em>
                    </button>
                </div>
            </section>
        </main>
    {/if}
</div>

<style>
    .reading-stats-center {
        display: grid;
        gap: 16px;
        width: 100%;
        max-width: 1380px;
        margin: 0 auto;
        padding: clamp(14px, 2vw, 26px);
        box-sizing: border-box;
        color: var(--b3-theme-on-background);
    }

    .reading-stats-header {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: start;
        gap: 14px;
        padding: 18px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background:
            linear-gradient(135deg, color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-surface)) 0%, var(--b3-theme-surface) 62%);
    }

    .reading-stats-center.embedded {
        max-width: none;
        padding: 0;
    }

    .reading-stats-center.embedded .reading-stats-header {
        grid-template-columns: minmax(0, 1fr) auto;
        padding: 16px;
    }

    .reading-stats-center.embedded .reading-stats-title-area h1 {
        font-size: 21px;
    }

    .reading-stats-title-area {
        min-width: 0;
    }

    .reading-stats-title-area h1 {
        margin: 0;
        color: var(--b3-theme-on-background);
        font-size: 24px;
        line-height: 1.25;
        letter-spacing: 0;
    }

    .reading-stats-title-area p {
        margin: 8px 0 5px;
        color: var(--b3-theme-on-surface);
        font-size: 13px;
        line-height: 1.5;
    }

    .reading-stats-title-area span {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }

    .reading-stats-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
    }

    .reading-stats-back,
    .reading-stats-primary,
    .reading-stats-secondary,
    .reading-stats-empty button,
    .metric-card,
    .coverage-grid button {
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        cursor: pointer;
        font: inherit;
    }

    .reading-stats-back {
        height: 32px;
        padding: 0 12px;
        font-size: 13px;
    }

    .reading-stats-primary,
    .reading-stats-secondary {
        height: 34px;
        padding: 0 12px;
        font-size: 13px;
        font-weight: 600;
    }

    .reading-stats-primary {
        border-color: var(--b3-theme-primary);
        background: var(--b3-theme-primary);
        color: #fff;
    }

    .reading-stats-primary:disabled,
    .reading-stats-empty button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
    }

    .reading-stats-secondary:hover,
    .reading-stats-back:hover,
    .metric-card:hover,
    .coverage-grid button:hover {
        border-color: var(--b3-theme-primary);
    }

    .reading-stats-loading,
    .reading-stats-empty {
        display: grid;
        place-items: center;
        gap: 10px;
        min-height: 360px;
        padding: 24px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
        text-align: center;
    }

    .reading-stats-loading span,
    .reading-stats-empty span {
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
        line-height: 1.6;
    }

    .reading-stats-empty strong {
        color: var(--b3-theme-on-background);
        font-size: 18px;
    }

    .reading-stats-empty-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px;
    }

    .reading-stats-empty button {
        min-height: 32px;
        padding: 0 12px;
        font-size: 13px;
    }

    .reading-stats-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--b3-border-color);
        border-top-color: var(--b3-theme-primary);
        border-radius: 50%;
        animation: reading-stats-spin 1s linear infinite;
    }

    .reading-stats-metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
    }

    .metric-card {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 46px;
        padding: 10px 14px;
        box-sizing: border-box;
        text-align: left;
    }

    .metric-card span,
    .coverage-grid span {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        white-space: nowrap;
    }

    .metric-card strong,
    .coverage-grid strong {
        overflow-wrap: anywhere;
        color: var(--b3-theme-on-background);
        font-size: 22px;
        line-height: 1.15;
    }

    .metric-card strong {
        font-size: 18px;
        white-space: nowrap;
    }

    .metric-card em,
    .coverage-grid em {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        font-style: normal;
        line-height: 1.35;
    }

    .metric-card em {
        overflow: hidden;
        min-width: 0;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .period-overview-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
    }

    .period-overview-grid div {
        display: grid;
        gap: 5px;
        min-width: 0;
        padding: 12px;
        border: 1px solid color-mix(in srgb, var(--b3-border-color) 72%, transparent);
        border-radius: 7px;
        background: var(--b3-theme-background);
        box-sizing: border-box;
    }

    .period-overview-grid span {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }

    .period-overview-grid strong,
    .reading-overview-panel strong {
        overflow-wrap: anywhere;
        color: var(--b3-theme-on-background);
        font-size: 18px;
        line-height: 1.25;
    }

    .reading-overview-panel {
        display: grid;
        gap: 12px;
    }

    .overview-detail-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
    }

    .sub-panel-title {
        margin-bottom: 8px;
        color: var(--b3-theme-on-background);
        font-size: 13px;
        font-weight: 700;
    }

    .period-compare {
        width: fit-content;
        padding: 4px 8px;
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 28%, var(--b3-border-color));
        border-radius: 999px;
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-background));
        color: var(--b3-theme-primary);
        font-size: 12px;
    }

    .period-switch {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 3px;
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-background);
    }

    .period-switch button {
        min-height: 24px;
        padding: 0 8px;
        border: 1px solid transparent;
        border-radius: 5px;
        background: transparent;
        color: var(--b3-theme-on-surface);
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        line-height: 1;
    }

    .period-switch button:hover {
        border-color: var(--b3-border-color);
        color: var(--b3-theme-on-background);
    }

    .period-switch button.active {
        border-color: color-mix(in srgb, var(--b3-theme-primary) 42%, var(--b3-border-color));
        background: color-mix(in srgb, var(--b3-theme-primary-light) 32%, var(--b3-theme-background));
        color: var(--b3-theme-primary);
    }

    .period-switch button:disabled {
        cursor: not-allowed;
        opacity: 0.45;
    }

    .period-list {
        display: grid;
        gap: 8px;
    }

    .period-list div {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 34px;
        padding: 8px 10px;
        border: 1px solid color-mix(in srgb, var(--b3-border-color) 72%, transparent);
        border-radius: 7px;
        background: var(--b3-theme-background);
        box-sizing: border-box;
    }

    .period-list span {
        overflow: hidden;
        color: var(--b3-theme-on-surface);
        font-size: 13px;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .period-list strong {
        color: var(--b3-theme-on-background);
        font-size: 13px;
        font-weight: 700;
        white-space: nowrap;
    }

    .reading-stats-grid {
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 12px;
    }

    .stats-panel {
        grid-column: span 6;
        min-width: 0;
        padding: 16px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
        box-sizing: border-box;
    }

    .stats-panel-wide {
        grid-column: span 6;
    }

    .stats-panel-full {
        grid-column: 1 / -1;
    }

    .stats-panel-books {
        grid-column: span 7;
    }

    .stats-panel-coverage {
        grid-column: span 5;
    }

    .stats-panel-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
    }

    .stats-panel-head h2 {
        margin: 0;
        color: var(--b3-theme-on-background);
        font-size: 15px;
        letter-spacing: 0;
    }

    .stats-panel-head span {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        text-align: right;
    }

    .panel-empty {
        display: grid;
        place-items: center;
        min-height: 180px;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
    }

    .panel-empty-compact {
        min-height: 112px;
    }

    .reading-calendar-heatmap {
        display: grid;
        gap: 10px;
        min-height: 260px;
        max-height: 320px;
        padding-top: 2px;
        box-sizing: border-box;
    }

    .calendar-heatmap-toolbar {
        display: grid;
        grid-template-columns: 32px minmax(0, 1fr) 32px;
        align-items: center;
        gap: 8px;
    }

    .calendar-heatmap-toolbar strong {
        color: var(--b3-theme-on-background);
        font-size: 15px;
        line-height: 1.3;
        text-align: center;
    }

    .calendar-heatmap-toolbar button {
        display: grid;
        place-items: center;
        width: 32px;
        height: 30px;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        cursor: pointer;
        font: inherit;
        font-size: 18px;
        line-height: 1;
    }

    .calendar-heatmap-toolbar button:hover {
        border-color: var(--b3-theme-primary);
    }

    .calendar-heatmap-toolbar button:disabled {
        cursor: not-allowed;
        opacity: 0.45;
    }

    .calendar-heatmap-weekdays,
    .calendar-heatmap-grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 5px;
    }

    .calendar-heatmap-weekdays span {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        line-height: 18px;
        text-align: center;
    }

    .calendar-heatmap-grid {
        grid-template-rows: repeat(var(--calendar-weeks), minmax(28px, 1fr));
        min-height: 174px;
    }

    .calendar-heatmap-cell,
    .calendar-heatmap-swatch {
        border: 1px solid color-mix(in srgb, var(--b3-border-color) 80%, transparent);
        border-radius: 6px;
        background: color-mix(in srgb, var(--b3-theme-surface) 84%, var(--b3-theme-background));
        box-sizing: border-box;
    }

    .calendar-heatmap-cell {
        display: grid;
        place-items: center;
        min-width: 0;
        min-height: 28px;
        padding: 0;
        color: var(--b3-theme-on-surface);
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        line-height: 1;
    }

    .calendar-heatmap-cell span {
        pointer-events: none;
    }

    .calendar-heatmap-cell:hover {
        border-color: var(--b3-theme-primary);
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--b3-theme-primary) 18%, transparent);
    }

    .calendar-heatmap-cell.out-month {
        color: var(--b3-theme-on-surface-light);
        opacity: 0.42;
    }

    .calendar-heatmap-cell.today {
        border-color: var(--b3-theme-primary);
        outline: 2px solid color-mix(in srgb, var(--b3-theme-primary) 34%, transparent);
        outline-offset: 1px;
    }

    .calendar-heatmap-cell.selected {
        border-color: var(--b3-theme-primary);
        box-shadow: inset 0 0 0 1px var(--b3-theme-primary);
    }

    .calendar-heatmap-cell.heat-level-1,
    .calendar-heatmap-swatch.heat-level-1 {
        background: color-mix(in srgb, var(--b3-theme-primary) 16%, var(--b3-theme-surface));
    }

    .calendar-heatmap-cell.heat-level-2,
    .calendar-heatmap-swatch.heat-level-2 {
        background: color-mix(in srgb, var(--b3-theme-primary) 30%, var(--b3-theme-surface));
    }

    .calendar-heatmap-cell.heat-level-3,
    .calendar-heatmap-swatch.heat-level-3 {
        background: color-mix(in srgb, var(--b3-theme-primary) 48%, var(--b3-theme-surface));
    }

    .calendar-heatmap-cell.heat-level-4,
    .calendar-heatmap-swatch.heat-level-4 {
        background: color-mix(in srgb, var(--b3-theme-primary) 68%, var(--b3-theme-surface));
    }

    .calendar-heatmap-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 28px;
    }

    .calendar-heatmap-summary {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 8px;
        min-width: 0;
    }

    .calendar-heatmap-summary strong {
        color: var(--b3-theme-on-background);
        font-size: 13px;
    }

    .calendar-heatmap-summary span,
    .calendar-heatmap-legend span {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }

    .calendar-heatmap-legend {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 5px;
        flex: 0 0 auto;
    }

    .calendar-heatmap-swatch {
        display: block;
        width: 14px;
        height: 14px;
    }

    .longest-book-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 9px;
    }

    .longest-book-item {
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        min-width: 0;
        padding: 9px;
        border: 1px solid color-mix(in srgb, var(--b3-border-color) 72%, transparent);
        border-radius: 7px;
        background: color-mix(in srgb, var(--b3-theme-surface) 86%, var(--b3-theme-background));
    }

    .longest-book-item img,
    .book-cover-placeholder {
        width: 42px;
        height: 58px;
        border-radius: 4px;
        object-fit: cover;
    }

    .book-cover-placeholder {
        display: grid;
        place-items: center;
        border: 1px dashed var(--b3-border-color);
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }

    .longest-book-item div {
        display: grid;
        gap: 4px;
        min-width: 0;
    }

    .longest-book-item strong {
        overflow: hidden;
        color: var(--b3-theme-on-background);
        font-size: 13px;
        line-height: 1.35;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .longest-book-item span {
        overflow: hidden;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .longest-book-item em {
        color: var(--b3-theme-primary);
        font-size: 12px;
        font-style: normal;
        font-weight: 600;
        white-space: nowrap;
    }

    .coverage-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 9px;
    }

    .coverage-grid button,
    .coverage-grid div {
        display: grid;
        gap: 5px;
        min-height: 96px;
        padding: 12px;
        border: 1px solid color-mix(in srgb, var(--b3-border-color) 72%, transparent);
        border-radius: 7px;
        background: var(--b3-theme-background);
        box-sizing: border-box;
        text-align: left;
    }

    .coverage-grid button:first-child {
        grid-column: span 2;
    }

    @keyframes reading-stats-spin {
        to {
            transform: rotate(360deg);
        }
    }

    @media (max-width: 1080px) {
        .reading-stats-header {
            grid-template-columns: auto minmax(0, 1fr);
        }

        .reading-stats-actions {
            grid-column: 1 / -1;
            justify-content: flex-start;
        }

        .reading-stats-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .period-overview-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .overview-detail-grid {
            grid-template-columns: 1fr;
        }

        .stats-panel,
        .stats-panel-full,
        .stats-panel-wide,
        .stats-panel-books,
        .stats-panel-coverage {
            grid-column: 1 / -1;
        }
    }

    @media (max-width: 640px) {
        .reading-stats-center {
            padding: 12px;
        }

        .reading-stats-header,
        .reading-stats-center.embedded .reading-stats-header {
            grid-template-columns: 1fr;
        }

        .reading-stats-metrics,
        .period-overview-grid,
        .overview-detail-grid,
        .longest-book-list,
        .coverage-grid {
            grid-template-columns: 1fr;
        }

        .coverage-grid button:first-child {
            grid-column: auto;
        }

        .stats-panel-head {
            align-items: flex-start;
            flex-direction: column;
        }

        .stats-panel-head span {
            text-align: left;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .reading-stats-spinner {
            animation: none;
        }
    }
</style>
