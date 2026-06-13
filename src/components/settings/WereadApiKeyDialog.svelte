<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import {
        clearWereadApiKey,
        loadWereadAuthState,
        verifyAndSaveWereadApiKey,
    } from "../../utils/settings/wereadSettingsService";

    export let plugin: any;
    export let close: () => void = () => {};
    export let onSaved: () => void = () => {};

    let apiKey = "";
    let maskedApiKey = "";
    let verified = false;
    let verifiedAt = 0;
    let lastError = "";
    let isLoading = true;
    let isVerifying = false;

    onMount(async () => {
        const state = await loadWereadAuthState(plugin);
        apiKey = state.apiKey;
        maskedApiKey = state.maskedApiKey;
        verified = state.verified;
        verifiedAt = state.verifiedAt;
        lastError = state.lastError;
        isLoading = false;
    });

    async function verify() {
        if (!apiKey.trim()) {
            showMessage("请输入微信读书 API Key");
            return;
        }
        isVerifying = true;
        try {
            const state = await verifyAndSaveWereadApiKey(plugin, apiKey);
            apiKey = state.apiKey;
            maskedApiKey = state.maskedApiKey;
            verified = state.verified;
            verifiedAt = state.verifiedAt;
            lastError = state.lastError;
            showMessage(state.verified ? "API Key 验证成功" : "API Key 验证失败");
            onSaved();
        } finally {
            isVerifying = false;
        }
    }

    async function clearKey() {
        const state = await clearWereadApiKey(plugin);
        apiKey = state.apiKey;
        maskedApiKey = state.maskedApiKey;
        verified = state.verified;
        verifiedAt = state.verifiedAt;
        lastError = state.lastError;
        showMessage("API Key 已清除");
        onSaved();
    }
</script>

<div class="settings-dialog settings-dialog-weread-auth">
    <header class="settings-dialog-header">
        <div class="settings-dialog-icon"><SiYuanIcon name="apiKey" size={20} /></div>
        <div>
            <h2>微信读书授权</h2>
            <p>配置用于同步划线、想法、书评和阅读统计的 API Key。</p>
        </div>
    </header>

    {#if isLoading}
        <div class="settings-dialog-loading">加载中...</div>
    {:else}
        <div class="settings-dialog-body">
            <label class="settings-dialog-field">
                <span>API Key</span>
                <input class="b3-text-field" type="password" bind:value={apiKey} placeholder="请输入 API Key" />
            </label>
            <div class:settings-dialog-status-ok={verified} class:settings-dialog-status-warn={!verified} class="settings-dialog-status">
                <SiYuanIcon name={verified ? "success" : "warning"} size={16} />
                {#if verified}
                    <span>已验证：{maskedApiKey} {verifiedAt ? ` / ${new Date(verifiedAt).toLocaleString()}` : ""}</span>
                {:else if lastError}
                    <span>{lastError}</span>
                {:else}
                    <span>尚未验证</span>
                {/if}
            </div>
        </div>
    {/if}

    <footer class="settings-dialog-actions">
        <button class="b3-button b3-button--outline" on:click={close}>关闭</button>
        <button class="b3-button b3-button--outline" on:click={clearKey} disabled={isVerifying}>清除</button>
        <button class="b3-button b3-button--primary" on:click={verify} disabled={isVerifying}>验证</button>
    </footer>
</div>

<style>
    .settings-dialog { display: flex; flex-direction: column; gap: 16px; padding: 18px; color: var(--b3-theme-on-background); background: var(--b3-theme-background); width: 100%; height: 100%; box-sizing: border-box; overflow: auto; min-width: 0; }
    .settings-dialog-header { display: flex; gap: 12px; align-items: flex-start; padding-bottom: 14px; border-bottom: 1px solid var(--b3-theme-border); flex-shrink: 0; }
    .settings-dialog-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 8px; color: var(--b3-theme-primary); background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent); }
    h2 { margin: 0 0 4px; font-size: 18px; line-height: 1.2; }
    p { margin: 0; color: var(--b3-theme-on-surface-light); font-size: 13px; line-height: 1.5; }
    .settings-dialog-body { display: grid; gap: 14px; flex: 1; min-height: 0; overflow: auto; }
    .settings-dialog-field { display: grid; gap: 8px; font-size: 13px; font-weight: 600; }
    .settings-dialog-status { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--b3-theme-border); font-size: 13px; }
    .settings-dialog-status-ok { color: var(--b3-theme-primary); background: color-mix(in srgb, var(--b3-theme-primary) 8%, transparent); }
    .settings-dialog-status-warn { color: var(--b3-theme-error); background: color-mix(in srgb, var(--b3-theme-error) 8%, transparent); }
    .settings-dialog-loading { padding: 32px; text-align: center; color: var(--b3-theme-on-surface-light); }
    .settings-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 14px; border-top: 1px solid var(--b3-theme-border); flex-shrink: 0; }
</style>
