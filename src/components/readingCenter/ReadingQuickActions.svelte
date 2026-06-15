<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { ReadingQuickAction } from "../../types/readingCenter";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";

    export let actions: ReadingQuickAction[] = [];

    const dispatch = createEventDispatcher();

    function handleAction(action: ReadingQuickAction) {
        dispatch("action", { id: action.id });
        action.action();
    }
</script>

<div class="quick-actions">
    <h3 class="section-title">更多操作</h3>
    <div class="actions-row">
        {#each actions as action (action.id)}
            <button class="action-chip" on:click={() => handleAction(action)}>
                <span class="action-icon">
                    {#if action.iconType === "siyuan"}
                        <SiYuanIcon name={action.icon} size={16} className="action-svg" />
                    {:else}
                        <SiYuanIcon name="weread" imageSrc={action.icon} size={16} className="action-img" />
                    {/if}
                </span>
                <span class="action-label">{action.label}</span>
            </button>
        {/each}
    </div>
</div>

<style>
    .quick-actions {
        margin-bottom: 24px;
    }

    .section-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--b3-theme-on-surface, #1a1a1a);
        margin: 0 0 12px 0;
    }

    .actions-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
    }

    .action-chip {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        background: var(--b3-theme-surface, #fff);
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 20px;
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 13px;
    }

    .action-chip:hover {
        background: var(--b3-theme-primary-light, #E8F5E9);
        border-color: var(--b3-theme-primary, #4CAF50);
        color: var(--b3-theme-primary, #4CAF50);
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(76, 175, 80, 0.15);
    }

    .action-icon {
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .action-svg {
        width: 16px;
        height: 16px;
    }

    .action-img {
        width: 16px;
        height: 16px;
    }

    .action-label {
        font-weight: 500;
        color: var(--b3-theme-on-surface, #1a1a1a);
    }

    .action-chip:hover .action-label {
        color: var(--b3-theme-primary, #4CAF50);
    }
</style>
