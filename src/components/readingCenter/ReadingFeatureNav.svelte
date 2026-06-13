<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { FeatureTab } from "../../types/readingCenter";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";

    export let tabs: FeatureTab[] = [];
    export let activeTab: string = "";

    const dispatch = createEventDispatcher();

    function handleClick(key: string) {
        if (key !== activeTab) {
            dispatch("switchTab", { key });
        }
    }
</script>

<div class="reading-feature-nav">
    {#each tabs as tab (tab.key)}
        <button
            class="feature-nav-item"
            class:active={tab.key === activeTab}
            role="tab"
            on:click={() => handleClick(tab.key)}
            title={tab.description}
        >
            <span class="feature-nav-icon">
                {#if tab.iconType === "siyuan"}
                    <SiYuanIcon name={tab.icon} size={16} />
                {:else}
                    <SiYuanIcon name="weread" imageSrc={tab.icon} size={16} />
                {/if}
            </span>
            <span class="feature-nav-label">{tab.label}</span>
        </button>
    {/each}
</div>

<style>
    .reading-feature-nav {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .feature-nav-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        background: var(--b3-theme-surface, #fff);
        border: 1px solid var(--b3-theme-border, #e0e0e0);
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        color: var(--b3-theme-on-surface, #1a1a1a);
        transition: all 0.2s ease;
    }

    .feature-nav-item:hover {
        background: var(--b3-theme-surface-light, #f5f5f5);
        border-color: var(--b3-theme-primary, #4CAF50);
    }

    .feature-nav-item.active {
        background: color-mix(in srgb, var(--b3-theme-primary, #4CAF50) 10%, transparent);
        border-color: var(--b3-theme-primary, #4CAF50);
        color: var(--b3-theme-primary, #4CAF50);
        font-weight: 600;
    }

    .feature-nav-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        flex-shrink: 0;
    }

    .feature-nav-label {
        white-space: nowrap;
    }
</style>
