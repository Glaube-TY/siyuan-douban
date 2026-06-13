<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import {
        loadDatabaseSettings,
        saveDatabaseSettings,
        validateDatabaseBlock,
    } from "../../utils/settings/databaseSettingsService";
    import type { WorkbenchDatabaseStatus } from "../../types/workbench";

    export let plugin: any;
    export let close: () => void = () => {};
    export let onSaved: () => void = () => {};

    let blockID = "";
    let status: WorkbenchDatabaseStatus | null = null;
    let isLoading = true;
    let isSaving = false;

    onMount(async () => {
        status = await loadDatabaseSettings(plugin);
        blockID = status.blockID;
        isLoading = false;
    });

    async function validate() {
        status = await validateDatabaseBlock(blockID);
        showMessage(status.message);
    }

    async function save() {
        isSaving = true;
        try {
            status = await saveDatabaseSettings(plugin, blockID);
            showMessage(status.valid ? "数据库设置已保存" : status.message);
            onSaved();
            if (status.valid) close();
        } finally {
            isSaving = false;
        }
    }
</script>

<div class="settings-dialog settings-dialog-database">
    <header class="settings-dialog-header">
        <div class="settings-dialog-icon"><SiYuanIcon name="database" size={20} /></div>
        <div>
            <h2>本地数据库设置</h2>
            <p>连接本地书籍属性视图，用于搜索、添加和打开读书笔记。</p>
        </div>
    </header>

    {#if isLoading}
        <div class="settings-dialog-loading">加载中...</div>
    {:else}
        <div class="settings-dialog-body">
            <label class="settings-dialog-field">
                <span>书籍数据库块 ID</span>
                <input class="b3-text-field" bind:value={blockID} placeholder="请输入包含属性视图的块 ID" />
            </label>

            {#if status}
                <div class:settings-dialog-status-ok={status.valid} class:settings-dialog-status-warn={!status.valid} class="settings-dialog-status">
                    <SiYuanIcon name={status.valid ? "success" : "warning"} size={16} />
                    <span>{status.message}</span>
                </div>
            {/if}
        </div>
    {/if}

    <footer class="settings-dialog-actions">
        <button class="b3-button b3-button--outline" on:click={close}>取消</button>
        <button class="b3-button b3-button--outline" on:click={validate} disabled={isSaving}>验证</button>
        <button class="b3-button b3-button--primary" on:click={save} disabled={isSaving}>保存</button>
    </footer>
</div>

<style>
    .settings-dialog {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 18px;
        color: var(--b3-theme-on-background);
        background: var(--b3-theme-background);
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        overflow: auto;
        min-width: 0;
    }

    .settings-dialog-header {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        padding-bottom: 14px;
        border-bottom: 1px solid var(--b3-theme-border);
        flex-shrink: 0;
    }

    .settings-dialog-icon {
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        border-radius: 8px;
        color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
    }

    h2 {
        margin: 0 0 4px;
        font-size: 18px;
        line-height: 1.2;
    }

    p {
        margin: 0;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
        line-height: 1.5;
    }

    .settings-dialog-body {
        display: grid;
        gap: 14px;
        flex: 1;
        min-height: 0;
        overflow: auto;
    }

    .settings-dialog-field {
        display: grid;
        gap: 8px;
        font-size: 13px;
        font-weight: 600;
    }

    .settings-dialog-status {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid var(--b3-theme-border);
        font-size: 13px;
    }

    .settings-dialog-status-ok {
        color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, transparent);
    }

    .settings-dialog-status-warn {
        color: var(--b3-theme-error);
        background: color-mix(in srgb, var(--b3-theme-error) 8%, transparent);
    }

    .settings-dialog-loading {
        padding: 32px;
        text-align: center;
        color: var(--b3-theme-on-surface-light);
    }

    .settings-dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding-top: 14px;
        border-top: 1px solid var(--b3-theme-border);
        flex-shrink: 0;
    }
</style>
