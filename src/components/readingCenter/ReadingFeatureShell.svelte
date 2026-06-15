<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import ReadingFeatureNav from "./ReadingFeatureNav.svelte";
    import type { FeatureTab } from "../../types/readingCenter";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";

    export let title: string = "";
    export let subtitle: string = "";
    export let tabs: FeatureTab[] = [];
    export let activeTab: string = "";

    const dispatch = createEventDispatcher();

    function handleBack() {
        dispatch("back");
    }

    function handleSwitchTab(event: CustomEvent) {
        dispatch("switchTab", event.detail);
    }
</script>

<div class="reading-feature-shell">
    <div class="reading-feature-header">
        <div class="reading-feature-header-top">
            <button class="reading-feature-back" on:click={handleBack}>
                <SiYuanIcon name="back" size={16} className="reading-feature-back-icon" />
                <span>返回总览</span>
            </button>
            <div class="reading-feature-breadcrumb">
                <span class="breadcrumb-root">阅读总控制台</span>
                <span class="breadcrumb-separator">/</span>
                <span class="breadcrumb-current">{title}</span>
            </div>
        </div>
        <div class="reading-feature-header-bottom">
            <div class="reading-feature-meta">
                <h2 class="reading-feature-title">{title}</h2>
                {#if subtitle}
                    <p class="reading-feature-subtitle">{subtitle}</p>
                {/if}
            </div>
            <ReadingFeatureNav {tabs} {activeTab} on:switchTab={handleSwitchTab} />
        </div>
    </div>

    <div class="reading-feature-body">
        <div class="reading-feature-content">
            <slot />
        </div>
    </div>
</div>

<style>
    .reading-feature-shell {
        height: 100%;
        display: flex;
        flex-direction: column;
        background: linear-gradient(
            180deg,
            var(--b3-theme-background, #f5f5f5) 0%,
            color-mix(in srgb, var(--b3-theme-background, #f5f5f5) 95%, var(--b3-theme-surface, #fff)) 100%
        );
    }

    .reading-feature-header {
        flex-shrink: 0;
        background: var(--b3-theme-surface, #fff);
        border-bottom: 1px solid var(--b3-border-color, #e0e0e0);
    }

    .reading-feature-header-top {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px clamp(16px, 2vw, 32px);
        border-bottom: 1px solid var(--b3-border-color, #e0e0e0);
    }

    .reading-feature-back {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: var(--b3-theme-background, #f5f5f5);
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        color: var(--b3-theme-on-surface, #1a1a1a);
        transition: all 0.2s ease;
        flex-shrink: 0;
    }

    .reading-feature-back:hover {
        background: var(--b3-theme-surface-light, #f5f5f5);
        border-color: var(--b3-theme-primary, #4CAF50);
        color: var(--b3-theme-primary, #4CAF50);
    }

    .reading-feature-breadcrumb {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: var(--b3-theme-on-surface-light, #666);
    }

    .breadcrumb-root {
        color: var(--b3-theme-on-surface-light, #888);
    }

    .breadcrumb-separator {
        color: var(--b3-border-color, #ccc);
    }

    .breadcrumb-current {
        color: var(--b3-theme-on-surface, #1a1a1a);
        font-weight: 500;
    }

    .reading-feature-header-bottom {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 14px clamp(16px, 2vw, 32px);
        flex-wrap: wrap;
    }

    .reading-feature-meta {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .reading-feature-title {
        font-size: 18px;
        font-weight: 700;
        color: var(--b3-theme-on-surface, #1a1a1a);
        margin: 0;
    }

    .reading-feature-subtitle {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light, #666);
        margin: 0;
    }

    .reading-feature-body {
        flex: 1;
        min-height: 0;
        overflow: hidden;
        padding: clamp(12px, 1.5vw, 20px) clamp(16px, 2vw, 32px);
    }

    .reading-feature-content {
        height: 100%;
        background: var(--b3-theme-surface, #fff);
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 12px;
        overflow: hidden;
    }

    @media (max-width: 768px) {
        .reading-feature-header-bottom {
            flex-direction: column;
            align-items: flex-start;
        }
    }
</style>
