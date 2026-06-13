<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import {
        loadBookPreferenceSettings,
        saveBookPreferenceSettings,
    } from "../../utils/settings/bookPreferenceSettingsService";

    export let plugin: any;
    export let close: () => void = () => {};
    export let onSaved: () => void = () => {};

    let ratings = "";
    let categories = "";
    let statuses = "";
    let isLoading = true;
    let isSaving = false;

    onMount(async () => {
        const data = await loadBookPreferenceSettings(plugin);
        ratings = data.ratings.join(", ");
        categories = data.categories.join(", ");
        statuses = data.statuses.join(", ");
        isLoading = false;
    });

    async function save() {
        isSaving = true;
        try {
            await saveBookPreferenceSettings(plugin, {
                ratings: ratings.split(/[,，]/),
                categories: categories.split(/[,，]/),
                statuses: statuses.split(/[,，]/),
            });
            showMessage("书籍偏好设置已保存");
            onSaved();
            close();
        } finally {
            isSaving = false;
        }
    }
</script>

<div class="settings-dialog settings-dialog-preferences">
    <header class="settings-dialog-header">
        <div class="settings-dialog-icon"><SiYuanIcon name="book" size={20} /></div>
        <div>
            <h2>书籍偏好设置</h2>
            <p>配置添加书籍时可选的评分、分类和阅读状态。</p>
        </div>
    </header>

    {#if isLoading}
        <div class="settings-dialog-loading">加载中...</div>
    {:else}
        <div class="settings-dialog-body">
            <label class="settings-dialog-field">
                <span>评分等级</span>
                <input class="b3-text-field" bind:value={ratings} placeholder="示例：五星, 四星, 三星" />
            </label>
            <label class="settings-dialog-field">
                <span>书籍分类</span>
                <input class="b3-text-field" bind:value={categories} placeholder="示例：文学, 商业, 技术" />
            </label>
            <label class="settings-dialog-field">
                <span>阅读状态</span>
                <input class="b3-text-field" bind:value={statuses} placeholder="示例：未读, 在读, 已读" />
            </label>
        </div>
    {/if}

    <footer class="settings-dialog-actions">
        <button class="b3-button b3-button--outline" on:click={close}>取消</button>
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
    h2 { margin: 0 0 4px; font-size: 18px; line-height: 1.2; }
    p { margin: 0; color: var(--b3-theme-on-surface-light); font-size: 13px; line-height: 1.5; }
    .settings-dialog-body { display: grid; gap: 14px; flex: 1; min-height: 0; overflow: auto; }
    .settings-dialog-field { display: grid; gap: 8px; font-size: 13px; font-weight: 600; }
    .settings-dialog-loading { padding: 32px; text-align: center; color: var(--b3-theme-on-surface-light); }
    .settings-dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding-top: 14px;
        border-top: 1px solid var(--b3-theme-border);
        flex-shrink: 0;
    }
</style>
