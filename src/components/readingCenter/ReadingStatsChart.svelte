<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { init, use } from "echarts/core";
    import { BarChart, HeatmapChart, LineChart, PieChart, RadarChart } from "echarts/charts";
    import {
        CalendarComponent,
        DatasetComponent,
        GridComponent,
        LegendComponent,
        TitleComponent,
        TooltipComponent,
        VisualMapComponent,
    } from "echarts/components";
    import { CanvasRenderer } from "echarts/renderers";
    import type { ECharts, EChartsCoreOption } from "echarts/core";

    use([
        BarChart,
        LineChart,
        HeatmapChart,
        RadarChart,
        PieChart,
        GridComponent,
        TooltipComponent,
        LegendComponent,
        CalendarComponent,
        TitleComponent,
        DatasetComponent,
        VisualMapComponent,
        CanvasRenderer,
    ]);

    export let option: EChartsCoreOption | null = null;
    export let height = 260;
    export let className = "";

    let el: HTMLDivElement;
    let chart: ECharts | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let failed = false;
    let mounted = false;

    function cssVar(name: string, fallback: string): string {
        const source = el || document.documentElement;
        const value = getComputedStyle(source).getPropertyValue(name).trim();
        return value || fallback;
    }

    function normalizeAxis(axis: any, colors: Record<string, string>) {
        if (!axis) return axis;
        const list = Array.isArray(axis) ? axis : [axis];
        const mapped = list.map((item) => ({
            ...item,
            axisLine: { lineStyle: { color: colors.border }, ...(item?.axisLine || {}) },
            axisTick: { lineStyle: { color: colors.border }, ...(item?.axisTick || {}) },
            axisLabel: { color: colors.onSurfaceLight, ...(item?.axisLabel || {}) },
            splitLine: { lineStyle: { color: colors.border, opacity: 0.45 }, ...(item?.splitLine || {}) },
        }));
        return Array.isArray(axis) ? mapped : mapped[0];
    }

    function buildThemedOption(raw: EChartsCoreOption): EChartsCoreOption {
        const colors = {
            primary: cssVar("--b3-theme-primary", "#4285f4"),
            secondary: cssVar("--b3-theme-secondary", "#6f7f95"),
            success: cssVar("--b3-theme-success", "#2e7d32"),
            error: cssVar("--b3-theme-error", "#d23f31"),
            onBackground: cssVar("--b3-theme-on-background", "#202124"),
            onSurface: cssVar("--b3-theme-on-surface", "#30343b"),
            onSurfaceLight: cssVar("--b3-theme-on-surface-light", "#7d8793"),
            border: cssVar("--b3-border-color", "#d9d9d9"),
            surface: cssVar("--b3-theme-surface", "#ffffff"),
        };
        const input = { ...(raw as any) };
        const chartKind = input.__chartKind;
        delete input.__chartKind;

        const next: any = {
            color: [colors.primary, colors.secondary, colors.success, colors.error],
            animationDuration: 650,
            textStyle: {
                color: colors.onSurface,
            },
            ...input,
            tooltip: {
                borderColor: colors.border,
                backgroundColor: colors.surface,
                textStyle: { color: colors.onSurface },
                ...(input.tooltip || {}),
            },
            legend: input.legend
                ? {
                    textStyle: { color: colors.onSurfaceLight },
                    ...input.legend,
                }
                : input.legend,
            xAxis: normalizeAxis(input.xAxis, colors),
            yAxis: normalizeAxis(input.yAxis, colors),
        };

        if (chartKind === "heatmap") {
            next.visualMap = {
                ...(input.visualMap || {}),
                inRange: {
                    color: [colors.surface, colors.primary],
                    ...(input.visualMap?.inRange || {}),
                },
            };
            if (input.calendar) {
                next.calendar = {
                    itemStyle: { borderColor: colors.border },
                    dayLabel: { color: colors.onSurfaceLight },
                    monthLabel: { color: colors.onSurfaceLight },
                    yearLabel: { color: colors.onSurfaceLight },
                    ...input.calendar,
                };
            }
        }

        if (input.radar) {
            next.radar = {
                axisName: { color: colors.onSurfaceLight },
                splitLine: { lineStyle: { color: colors.border } },
                splitArea: { areaStyle: { color: ["transparent"] } },
                axisLine: { lineStyle: { color: colors.border } },
                ...input.radar,
            };
        }

        return next;
    }

    function render() {
        if (!mounted || !chart || !option) return;
        try {
            failed = false;
            chart.setOption(buildThemedOption(option), true);
            chart.resize();
        } catch (error) {
            console.error("[ReadingStatsChart] render failed:", error);
            failed = true;
        }
    }

    onMount(() => {
        mounted = true;
        chart = init(el, undefined, { renderer: "canvas" });
        resizeObserver = typeof ResizeObserver !== "undefined"
            ? new ResizeObserver(() => chart?.resize())
            : null;
        resizeObserver?.observe(el);
        window.addEventListener("resize", render);
        render();
    });

    onDestroy(() => {
        mounted = false;
        window.removeEventListener("resize", render);
        resizeObserver?.disconnect();
        chart?.dispose();
        chart = null;
    });

    $: if (mounted && option) {
        render();
    }
</script>

<div class={`reading-stats-chart ${className}`} style={`height: ${height}px;`}>
    {#if failed}
        <div class="reading-stats-chart-empty">图表加载失败</div>
    {/if}
    <div bind:this={el} class="reading-stats-chart-canvas" class:hidden={failed}></div>
</div>

<style>
    .reading-stats-chart {
        position: relative;
        width: 100%;
        min-width: 0;
    }

    .reading-stats-chart-canvas {
        width: 100%;
        height: 100%;
    }

    .reading-stats-chart-canvas.hidden {
        visibility: hidden;
    }

    .reading-stats-chart-empty {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }
</style>
