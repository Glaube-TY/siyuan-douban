<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import type { WorkbenchAction } from "../../types/workbench";

    const dispatch = createEventDispatcher<{ action: WorkbenchAction }>();

    const actions: Array<{ type: WorkbenchAction; label: string; icon: string }> = [
        { type: "search", label: "搜索书籍", icon: "search" },
        { type: "open-local-shelf", label: "本地书架", icon: "localShelf" },
        { type: "sync-weread-update", label: "更新同步", icon: "sync" },
        { type: "open-inbox", label: "新增笔记", icon: "inbox" },
        { type: "open-diagnostics", label: "同步诊断", icon: "diagnostics" },
        { type: "open-database-settings", label: "数据库", icon: "database" },
        { type: "open-template-settings", label: "模板", icon: "template" },
        { type: "open-weread-auth", label: "微信授权", icon: "apiKey" },
        { type: "open-about", label: "关于", icon: "info" },
    ];
</script>

<section class="workbench-action-bar">
    {#each actions as action (action.type)}
        <button on:click={() => dispatch("action", action.type)} title={action.label}>
            <SiYuanIcon name={action.icon} size={15} />
            <span>{action.label}</span>
        </button>
    {/each}
</section>

<style>
    .workbench-action-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 12px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
    }

    button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 30px;
        padding: 0 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
    }

    button:hover {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }
</style>
