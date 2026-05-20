<script lang="ts">
    import { formatReadingDuration } from "@/utils/weread/api/formatWereadReadingStats";

    export let items: Array<{ title: string; readingTime: number; readingCount: number; score: number; radarValue: number; }>;
    export let i18n: any;

    function i18nText(key: string, fallback = ""): string {
        const value = i18n?.[key];
        return typeof value === "string" ? value : fallback;
    }

    $: radarItems = (items || []).slice(0, 8);
    $: hasData = radarItems.length > 0;
    $: pointCount = radarItems.length;

    let radarEl: HTMLDivElement | null = null;
    let tooltipVisible = false;
    let tooltipX = 0;
    let tooltipY = 0;
    let tooltipItem: { title: string; readingTime: number; readingCount: number; radarValue: number; } | null = null;

    function showTooltip(item: { title: string; readingTime: number; readingCount: number; radarValue: number; }, event: MouseEvent) {
        tooltipItem = item;
        tooltipVisible = true;
        moveTooltip(event);
    }

    function moveTooltip(event: MouseEvent) {
        if (!radarEl) return;
        const rect = radarEl.getBoundingClientRect();
        tooltipX = event.clientX - rect.left + 14;
        tooltipY = event.clientY - rect.top + 14;
    }

    function hideTooltip() {
        tooltipVisible = false;
        tooltipItem = null;
    }

    function getTooltipLines(item: { title: string; readingTime: number; readingCount: number; radarValue: number; }): string[] {
        if (!item) return [];
        const title = item.title || i18nText("wereadReadingStatsUncategorized", "未分类");
        const percent = Math.round(item.radarValue || 0);
        return [
            title,
            `阅读时长：${formatReadingDuration(item.readingTime || 0)}`,
            `阅读数量：${item.readingCount || 0}本`,
            `偏好强度：${percent}%`,
        ];
    }

    const size = 360;
    const height = 300;
    const centerX = size / 2;
    const centerY = height / 2;
    const maxRadius = 82;
    const labelRadius = 118;
    const levels = [25, 50, 75, 100];

    function getAngle(index: number, total: number): number {
        return (Math.PI * 2 * index) / total - Math.PI / 2;
    }

    function getPoint(index: number, total: number, value: number): { x: number; y: number } {
        const angle = getAngle(index, total);
        const r = (value / 100) * maxRadius;
        return {
            x: centerX + r * Math.cos(angle),
            y: centerY + r * Math.sin(angle),
        };
    }

    function getGridPoints(level: number, total: number): string {
        const r = (level / 100) * maxRadius;
        const points: string[] = [];
        for (let i = 0; i < total; i++) {
            const angle = getAngle(i, total);
            const x = centerX + r * Math.cos(angle);
            const y = centerY + r * Math.sin(angle);
            points.push(`${x},${y}`);
        }
        return points.join(" ");
    }

    $: dataPolygon = radarItems.map((item, i) => {
        const p = getPoint(i, pointCount, item.radarValue);
        return `${p.x},${p.y}`;
    }).join(" ");

    function clampLabel(x: number, y: number): { x: number; y: number } {
        return {
            x: Math.max(12, Math.min(size - 12, x)),
            y: Math.max(18, Math.min(height - 18, y)),
        };
    }

    $: labelPositions = radarItems.map((item, i) => {
        const angle = getAngle(i, pointCount);
        let x = centerX + labelRadius * Math.cos(angle);
        let y = centerY + labelRadius * Math.sin(angle);
        let anchor = "middle";
        let dy = "0.35em";

        if (Math.cos(angle) > 0.3) {
            anchor = "start";
        } else if (Math.cos(angle) < -0.3) {
            anchor = "end";
        }

        if (Math.sin(angle) < -0.5) {
            dy = "-0.5em";
        } else if (Math.sin(angle) > 0.5) {
            dy = "1em";
        }

        const clamped = clampLabel(x, y);
        return { x: clamped.x, y: clamped.y, text: item.title, anchor, dy };
    });

    function shortLabel(text: string): string {
        const name = text || i18nText("wereadReadingStatsUncategorized", "未分类");
        return name.length > 5 ? name.slice(0, 5) + "…" : name;
    }
</script>

{#if hasData}
    <div bind:this={radarEl} class="weread-reading-radar">
        <svg class="weread-reading-radar-svg" viewBox={`0 0 ${size} ${height}`} xmlns="http://www.w3.org/2000/svg">
            <polygon
                class="weread-reading-radar-area"
                points={dataPolygon}
            />

            {#each levels as level}
                <polygon
                    class="weread-reading-radar-grid"
                    points={getGridPoints(level, pointCount)}
                />
            {/each}

            {#each radarItems as _, i}
                <line
                    class="weread-reading-radar-axis"
                    x1={centerX}
                    y1={centerY}
                    x2={getPoint(i, pointCount, 100).x}
                    y2={getPoint(i, pointCount, 100).y}
                />
            {/each}

            {#each radarItems as item, i}
                <circle
                    class="weread-reading-radar-hit"
                    cx={getPoint(i, pointCount, Math.max(item.radarValue, 2)).x}
                    cy={getPoint(i, pointCount, Math.max(item.radarValue, 2)).y}
                    r="10"
                />

                {#if item.radarValue > 0}
                    <circle
                        class="weread-reading-radar-dot"
                        cx={getPoint(i, pointCount, item.radarValue).x}
                        cy={getPoint(i, pointCount, item.radarValue).y}
                        r="4"
                    />
                {/if}

                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <text
                    class="weread-reading-radar-label"
                    x={labelPositions[i].x}
                    y={labelPositions[i].y}
                    text-anchor={labelPositions[i].anchor}
                    dy={labelPositions[i].dy}
                    on:mouseenter={(event) => showTooltip(item, event)}
                    on:mousemove={moveTooltip}
                    on:mouseleave={hideTooltip}
                >
                    {shortLabel(labelPositions[i].text)}
                </text>
            {/each}
        </svg>

        {#if tooltipVisible && tooltipItem}
            <div
                class="weread-reading-radar-tooltip"
                style={`left: ${tooltipX}px; top: ${tooltipY}px;`}
            >
                {#each getTooltipLines(tooltipItem) as line, index}
                    <div class:index-title={index === 0}>{line}</div>
                {/each}
            </div>
        {/if}
    </div>
{:else}
    <div class="weread-reading-radar-empty">{i18nText("wereadReadingStatsNoRecords", "暂无记录")}</div>
{/if}
