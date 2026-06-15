<script lang="ts">
    import type { ReadingDashboardCard } from "../../types/readingCenter";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";

    export let cards: ReadingDashboardCard[] = [];

    // 判断是否为高亮卡片（有笔记书籍、总阅读）
    function isHighlightCard(cardId: string): boolean {
        return cardId === "note-books" || cardId === "overall-reading";
    }
</script>

<div class="dashboard-cards">
    {#each cards as card (card.id)}
        <div
            class="dashboard-card"
            class:dashboard-card--highlight={isHighlightCard(card.id)}
            style="--card-color: {card.color};"
        >
            <div class="card-accent"></div>
            <div class="card-body">
                <div class="card-header">
                    <div class="card-icon">
                        <SiYuanIcon name={card.icon} size={20} className="card-svg" />
                    </div>
                    <div class="card-value">{card.value}</div>
                </div>
                <div class="card-title">{card.title}</div>
                {#if card.description}
                    <div class="card-description">{card.description}</div>
                {/if}
            </div>
        </div>
    {/each}
</div>

<style>
    .dashboard-cards {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
        margin-bottom: 24px;
    }

    .dashboard-card {
        background: var(--b3-theme-surface, #fff);
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        border: 1px solid var(--b3-border-color, #e0e0e0);
        transition: all 0.2s ease;
        position: relative;
    }

    .dashboard-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
    }

    .dashboard-card--highlight {
        grid-column: span 1;
        background: linear-gradient(135deg, var(--b3-theme-surface, #fff) 0%, var(--b3-theme-surface-light, #f8f9fa) 100%);
        border-color: var(--card-color);
        box-shadow: 0 2px 12px color-mix(in srgb, var(--card-color) 15%, transparent);
    }

    .card-accent {
        height: 4px;
        background: linear-gradient(90deg, var(--card-color), color-mix(in srgb, var(--card-color) 60%, transparent));
    }

    .card-body {
        padding: 16px;
    }

    .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
    }

    .card-icon {
        width: 36px;
        height: 36px;
        background: color-mix(in srgb, var(--card-color) 10%, transparent);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .card-svg {
        width: 20px;
        height: 20px;
        color: var(--card-color);
    }

    .card-value {
        font-size: clamp(18px, 2vw, 28px);
        font-weight: 700;
        color: var(--b3-theme-on-surface, #1a1a1a);
        line-height: 1.2;
        word-break: break-word;
        text-align: right;
    }

    .dashboard-card--highlight .card-value {
        color: var(--card-color);
    }

    .card-title {
        font-size: 13px;
        font-weight: 500;
        color: var(--b3-theme-on-surface-light, #666);
        margin-bottom: 4px;
    }

    .card-description {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light, #999);
        line-height: 1.4;
    }

    @media (max-width: 1100px) {
        .dashboard-cards {
            grid-template-columns: repeat(3, 1fr);
        }
    }

    @media (max-width: 800px) {
        .dashboard-cards {
            grid-template-columns: repeat(2, 1fr);
        }
    }

    @media (max-width: 520px) {
        .dashboard-cards {
            grid-template-columns: 1fr;
        }
    }
</style>
