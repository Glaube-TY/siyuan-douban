<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import type { ReadingCenterOverview } from "../../types/readingCenter";
    import type { WorkbenchAction } from "../../types/workbench";

    export let overviewData: ReadingCenterOverview | null = null;

    const dispatch = createEventDispatcher<{ action: WorkbenchAction }>();

    const entries: Array<{ type: WorkbenchAction; label: string; icon: string; description: string; valueKey: string }> = [
        { type: "open-book-status", label: "待整理书籍", icon: "book", description: "整理状态和新增笔记", valueKey: "pendingBookCount" },
        { type: "open-review", label: "今日复习", icon: "review", description: "到期复习条目", valueKey: "pendingReview" },
        { type: "open-topics", label: "主题阅读", icon: "topic", description: "主题沉淀入口", valueKey: "topic" },
        { type: "open-digest", label: "周报月报", icon: "stats", description: "周期回看入口", valueKey: "digest" },
    ];

    function valueFor(key: string): string | number {
        if (!overviewData) return "暂无";
        if (key === "pendingBookCount") return overviewData.pendingBookCount;
        if (key === "pendingReview") return overviewData.pendingReview;
        return "入口";
    }
</script>

<section class="workbench-panel workbench-review-panel">
    <div class="workbench-panel-head">
        <div class="workbench-panel-title">
            <SiYuanIcon name="review" size={18} />
            <h2>整理与回看</h2>
        </div>
    </div>

    <div class="workbench-review-grid">
        {#each entries as entry (entry.type)}
            <button on:click={() => dispatch("action", entry.type)}>
                <span class="workbench-review-icon"><SiYuanIcon name={entry.icon} size={17} /></span>
                <strong>{valueFor(entry.valueKey)}</strong>
                <span>{entry.label}</span>
                <em>{entry.description}</em>
            </button>
        {/each}
    </div>
</section>

<style>
    .workbench-panel {
        display: grid;
        gap: 14px;
        padding: 16px;
        border: 1px solid var(--b3-theme-border);
        border-radius: 8px;
        background: var(--b3-theme-surface);
    }

    .workbench-panel-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
    }

    .workbench-panel-title {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--b3-theme-primary);
    }

    h2 {
        margin: 0;
        color: var(--b3-theme-on-background);
        font-size: 16px;
    }

    .workbench-review-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
    }

    .workbench-review-grid button {
        display: grid;
        gap: 5px;
        min-width: 0;
        padding: 12px;
        border: 1px solid var(--b3-theme-border);
        border-radius: 8px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        cursor: pointer;
        text-align: left;
    }

    .workbench-review-grid button:hover {
        border-color: var(--b3-theme-primary);
    }

    .workbench-review-icon {
        color: var(--b3-theme-primary);
    }

    strong {
        font-size: 20px;
        line-height: 1.1;
    }

    span {
        font-size: 13px;
        font-weight: 700;
    }

    em {
        overflow: hidden;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        font-style: normal;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    @media (max-width: 920px) {
        .workbench-review-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
</style>
