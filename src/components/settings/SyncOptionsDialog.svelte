<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import { loadWereadSyncOptions, saveWereadSyncOptions } from "../../utils/settings/wereadSettingsService";

    export let plugin: any;
    export let close: () => void = () => {};
    export let onSaved: () => void = () => {};

    let autoSync = false;
    let skipNewBookCheck = false;
    let isLoading = true;
    let isSaving = false;

    onMount(async () => {
        const options = await loadWereadSyncOptions(plugin);
        autoSync = options.autoSync;
        skipNewBookCheck = options.skipNewBookCheck;
        isLoading = false;
    });

    async function save() {
        isSaving = true;
        try {
            await saveWereadSyncOptions(plugin, { autoSync, skipNewBookCheck });
            showMessage("同步选项已保存");
            onSaved();
            close();
        } finally {
            isSaving = false;
        }
    }
</script>

<div class="settings-dialog settings-dialog-sync-options">
    <header class="settings-dialog-header">
        <div class="settings-dialog-icon"><SiYuanIcon name="sync" size={20} /></div>
        <div>
            <h2>同步选项</h2>
            <p>只调整已有同步开关，不改动自动同步和手动同步主链路。</p>
        </div>
    </header>

    {#if isLoading}
        <div class="settings-dialog-loading">加载中...</div>
    {:else}
        <div class="settings-dialog-body">
            <label class="settings-dialog-switch-row">
                <span>
                    <strong>自动同步</strong>
                    <em>布局就绪后按原有逻辑检查 API Key 并执行自动同步。</em>
                </span>
                <input type="checkbox" class="settings-switch" bind:checked={autoSync} />
                <span class="settings-switch-track"><span class="settings-switch-thumb"></span></span>
            </label>
            <label class="settings-dialog-switch-row">
                <span>
                    <strong>跳过新书确认</strong>
                    <em>沿用原同步面板的选项，只影响已有新来源确认流程。</em>
                </span>
                <input type="checkbox" class="settings-switch" bind:checked={skipNewBookCheck} />
                <span class="settings-switch-track"><span class="settings-switch-thumb"></span></span>
            </label>
        </div>
    {/if}

    <footer class="settings-dialog-actions">
        <button class="b3-button b3-button--outline" on:click={close}>取消</button>
        <button class="b3-button b3-button--primary" on:click={save} disabled={isSaving}>保存</button>
    </footer>
</div>

<style>
    .settings-dialog { display: flex; flex-direction: column; gap: 16px; padding: 18px; color: var(--b3-theme-on-background); background: var(--b3-theme-background); width: 100%; height: 100%; box-sizing: border-box; overflow: auto; min-width: 0; }
    .settings-dialog-header { display: flex; gap: 12px; align-items: flex-start; padding-bottom: 14px; border-bottom: 1px solid var(--b3-border-color); flex-shrink: 0; }
    .settings-dialog-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 8px; color: var(--b3-theme-primary); background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent); }
    h2 { margin: 0 0 4px; font-size: 18px; line-height: 1.2; }
    p { margin: 0; color: var(--b3-theme-on-surface-light); font-size: 13px; line-height: 1.5; }
    .settings-dialog-body { display: grid; gap: 14px; flex: 1; min-height: 0; overflow: auto; }
    .settings-dialog-switch-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 8px; background: var(--b3-theme-surface); }
    .settings-dialog-switch-row span:first-child { display: grid; gap: 3px; }
    .settings-dialog-switch-row strong { font-size: 13px; }
    .settings-dialog-switch-row em { color: var(--b3-theme-on-surface-light); font-size: 12px; font-style: normal; line-height: 1.4; }
    .settings-dialog-loading { padding: 32px; text-align: center; color: var(--b3-theme-on-surface-light); }
    .settings-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 14px; border-top: 1px solid var(--b3-border-color); flex-shrink: 0; }
</style>
