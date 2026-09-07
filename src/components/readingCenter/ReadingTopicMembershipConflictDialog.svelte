<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "../../utils/i18n";

    export let plugin: any;
    export let topicNames: string[] = [];
    export let currentTopicName = "";
    export let close: () => void;
    export let onKeep: () => void;
    export let onMove: () => void;

    let cancelButton: HTMLButtonElement;

    const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) =>
        t(plugin, key, fallback, params);

    onMount(() => {
        cancelButton?.focus();
    });

    function choose(action: () => void): void {
        close();
        action();
    }
</script>

<div
    class="membership-conflict"
    role="dialog"
    aria-labelledby="topic-membership-conflict-title"
    aria-describedby="topic-membership-conflict-description"
>
    <div class="membership-conflict-content">
        <h3 id="topic-membership-conflict-title">{tx("topicsMembershipConflictTitle", "笔记已属于其他主题")}</h3>
        <p>{tx("topicsMembershipConflictIntro", "这条笔记目前已加入：")}</p>
        <ul>
            {#each topicNames as topicName}
                <li>{topicName}</li>
            {/each}
        </ul>
        <p id="topic-membership-conflict-description">
            {tx(
                "topicsMembershipConflictDescription",
                "你可以同时加入当前主题「{topic}」，或从其他主题移除后移动到当前主题。",
                { topic: currentTopicName },
            )}
        </p>
    </div>

    <div class="membership-conflict-actions">
        <button type="button" class="membership-conflict-cancel" bind:this={cancelButton} on:click={() => choose(() => {})}>
            {tx("cancel", "取消")}
        </button>
        <button type="button" on:click={() => choose(onKeep)}>
            <span>{tx("topicsMembershipKeep", "同时添加")}</span>
            <small>{tx("topicsMembershipKeepDescription", "保留其他主题，并加入当前主题")}</small>
        </button>
        <button type="button" class="membership-conflict-primary" on:click={() => choose(onMove)}>
            <span>{tx("topicsMembershipMove", "移动到当前主题")}</span>
            <small>{tx("topicsMembershipMoveDescription", "从其他主题移除，仅保留当前主题")}</small>
        </button>
    </div>
</div>

<style>
    .membership-conflict {
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-width: 0;
        box-sizing: border-box;
        padding: 16px;
        color: var(--b3-theme-on-surface, #1f2937);
    }

    .membership-conflict-content {
        min-width: 0;
    }

    h3,
    p,
    ul {
        margin: 0;
    }

    h3 {
        font-size: 16px;
        line-height: 1.4;
    }

    p {
        margin-top: 8px;
        color: var(--b3-theme-on-surface-light, #666);
        font-size: 13px;
        line-height: 1.55;
    }

    ul {
        display: grid;
        gap: 4px;
        margin-top: 8px;
        padding-left: 20px;
        color: var(--b3-theme-on-surface, #1f2937);
        font-size: 13px;
        line-height: 1.5;
    }

    .membership-conflict-actions {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr);
        gap: 8px;
        align-items: stretch;
    }

    .membership-conflict-actions button {
        display: flex;
        min-width: 0;
        min-height: 42px;
        flex-direction: column;
        justify-content: center;
        gap: 2px;
        padding: 7px 10px;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 6px;
        background: var(--b3-theme-surface, #fff);
        color: var(--b3-theme-on-surface, #1f2937);
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        text-align: left;
    }

    .membership-conflict-actions button:hover {
        border-color: var(--b3-theme-primary, #4caf50);
    }

    .membership-conflict-actions button:focus-visible {
        outline: 2px solid var(--b3-theme-primary, #4caf50);
        outline-offset: 1px;
    }

    .membership-conflict-actions small {
        color: var(--b3-theme-on-surface-light, #666);
        font-size: 11px;
        line-height: 1.4;
    }

    .membership-conflict-cancel {
        align-self: center;
        min-height: 32px !important;
        white-space: nowrap;
    }

    .membership-conflict-primary {
        border-color: var(--b3-theme-primary, #4caf50) !important;
        background: var(--b3-theme-primary, #4caf50) !important;
        color: var(--b3-theme-on-primary, #fff) !important;
    }

    .membership-conflict-primary small {
        color: color-mix(in srgb, var(--b3-theme-on-primary, #fff) 82%, transparent);
    }

    @media (max-width: 600px) {
        .membership-conflict {
            min-height: 100%;
            padding: 12px;
        }

        .membership-conflict-actions {
            grid-template-columns: 1fr;
        }

        .membership-conflict-cancel {
            order: 3;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .membership-conflict-actions button {
            transition: none;
        }
    }
</style>
