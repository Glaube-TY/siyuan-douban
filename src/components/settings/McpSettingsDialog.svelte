<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import { getMcpRuntimeState, setMcpEnabled, type McpRuntimeState } from "../../utils/settings/mcpSettingsService";
    import { t } from "../../utils/i18n";

    export let plugin: any;
    export let close: () => void = () => {};
    export let onSaved: () => void = () => {};

    let state: McpRuntimeState | null = null;
    let draftEnabled = false;
    let isLoading = true;
    let isSaving = false;
    let errorMessage = "";
    $: isDirty = state !== null && draftEnabled !== state.enabled;
    const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) =>
        t(plugin, key, fallback, params);

    onMount(loadState);

    async function loadState() {
        isLoading = true;
        errorMessage = "";
        try {
            const next = await getMcpRuntimeState(plugin);
            state = next;
            draftEnabled = next.enabled;
        } catch (error) {
            state = null;
            errorMessage = getErrorMessage(error);
        } finally {
            isLoading = false;
        }
    }

    async function save() {
        if (!state || isLoading || isSaving || state.status === "initializing" || !isDirty) return;

        isSaving = true;
        errorMessage = "";
        const requestedEnabled = draftEnabled;
        try {
            const next = await setMcpEnabled(plugin, requestedEnabled);
            state = next;
            draftEnabled = next.enabled;
            if (requestedEnabled
                ? !(next.enabled && next.active && next.capabilityCount === next.expectedCapabilityCount)
                : next.enabled || next.active) {
                throw new Error(tx("settingsMcpStateMismatch", "Kernel 返回的 MCP 状态未达到请求结果"));
            }
            showMessage(tx("settingsMcpSaved", "MCP 设置已保存"));
            onSaved();
            close();
        } catch (error) {
            const operationLabel = requestedEnabled
                ? tx("settingsMcpEnableFailed", "开启 MCP 失败")
                : tx("settingsMcpDisableFailed", "关闭 MCP 失败");
            errorMessage = `${operationLabel}：${getErrorMessage(error)}`;
            showMessage(errorMessage, 5000);
            try {
                const current = await getMcpRuntimeState(plugin);
                state = current;
                draftEnabled = current.enabled;
            } catch {
                // 保留当前弹窗和错误，不把刷新失败伪装成关闭状态。
            }
        } finally {
            isSaving = false;
        }
    }

    function isCompleteEnabled(value: McpRuntimeState): boolean {
        return value.status === "enabled"
            && value.enabled
            && value.active
            && value.capabilityCount === value.expectedCapabilityCount;
    }

    function isErrorState(value: McpRuntimeState): boolean {
        if (value.status === "error") return true;
        if (value.status === "enabled") return !isCompleteEnabled(value);
        return value.enabled || value.active;
    }

    function statusText(value: McpRuntimeState): string {
        if (value.status === "initializing") return tx("settingsMcpStatusConnecting", "正在连接 Kernel…");
        if (isCompleteEnabled(value)) {
            return `${tx("settingsMcpStatusEnabled", "已开启")} · ${tx("settingsMcpCapabilityShort", "{count}/{expected}", {
                count: value.capabilityCount,
                expected: value.expectedCapabilityCount,
            })}`;
        }
        if (isErrorState(value)) return tx("settingsMcpStatusError", "服务异常");
        return tx("settingsMcpStatusDisabled", "已关闭");
    }

    function getErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error || tx("uiUnknownError", "未知错误"));
    }
</script>

<div class="settings-dialog settings-dialog-mcp">
    {#if isLoading}
        <div class="settings-dialog-loading" aria-live="polite">{tx("uiLoading", "加载中...")}</div>
    {:else if !state}
        <div class="settings-dialog-error" role="alert">
            <strong>{tx("settingsMcpLoadFailed", "无法连接 MCP 服务")}</strong>
            <span>{errorMessage}</span>
            <button type="button" class="b3-button b3-button--outline" on:click={loadState} disabled={isLoading}>
                {tx("settingsMcpRetry", "重试")}
            </button>
        </div>
    {:else}
        <div class="settings-dialog-body">
            <label class="settings-dialog-switch-row" for="mcp-enabled">
                <span class="settings-dialog-switch-copy">
                    <strong>{tx("settingsMcpEnable", "启用 MCP")}</strong>
                    <em id="mcp-readonly-short">{tx("settingsMcpReadOnlyShort", "仅提供只读访问")}</em>
                </span>
                <input
                    id="mcp-enabled"
                    type="checkbox"
                    class="settings-switch"
                    bind:checked={draftEnabled}
                    disabled={isSaving || state.status === "initializing"}
                    aria-describedby="mcp-readonly-short"
                />
                <span class="settings-switch-track"><span class="settings-switch-thumb"></span></span>
            </label>

            <div
                class:settings-dialog-status-active={isCompleteEnabled(state)}
                class:settings-dialog-status-error={isErrorState(state)}
                class="settings-dialog-status"
                aria-live="polite"
            >
                <span>{statusText(state)}</span>
            </div>

            {#if state.lastError || errorMessage}
                <div class="settings-dialog-error" role="alert">
                    <strong>{tx("settingsMcpError", "MCP 服务错误")}</strong>
                    {#if state.lastError}<span>{state.lastError}</span>{/if}
                    {#if errorMessage}<span>{errorMessage}</span>{/if}
                    <button type="button" class="b3-button b3-button--outline" on:click={loadState} disabled={isLoading || isSaving}>
                        {tx("settingsMcpRetry", "重试")}
                    </button>
                </div>
            {/if}
        </div>
    {/if}

    <footer class="settings-dialog-actions">
        <button type="button" class="b3-button b3-button--outline" on:click={close}>{t(plugin, "cancel", "取消")}</button>
        <button
            type="button"
            class="b3-button b3-button--primary"
            on:click={save}
            disabled={isLoading || isSaving || !state || state.status === "initializing" || !isDirty}
        >{tx("uiSave", "保存")}</button>
    </footer>
</div>

<style>
    .settings-dialog { display: flex; flex-direction: column; gap: 14px; padding: 16px; color: var(--b3-theme-on-background); background: var(--b3-theme-background); width: 100%; height: 100%; box-sizing: border-box; overflow: auto; min-width: 0; }
    .settings-dialog-body { display: grid; gap: 12px; flex: 1; min-height: 0; overflow: auto; }
    .settings-dialog-switch-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 8px; background: var(--b3-theme-surface); }
    .settings-dialog-switch-copy { display: grid; gap: 3px; min-width: 0; }
    .settings-dialog-switch-row strong { font-size: 13px; }
    .settings-dialog-switch-row em { color: var(--b3-theme-on-surface-light); font-size: 12px; font-style: normal; line-height: 1.4; }
    .settings-dialog-switch-row:has(input:disabled) { cursor: not-allowed; opacity: .7; }
    .settings-dialog-status { display: flex; align-items: center; min-height: 20px; padding: 0 2px; color: var(--b3-theme-on-surface-light); font-size: 12px; line-height: 1.4; }
    .settings-dialog-status-active { color: var(--b3-theme-primary); }
    .settings-dialog-status-error { color: var(--b3-theme-error); }
    .settings-dialog-loading { padding: 32px; text-align: center; color: var(--b3-theme-on-surface-light); }
    .settings-dialog-error { display: grid; gap: 6px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--b3-theme-error) 45%, var(--b3-border-color)); border-radius: 8px; color: var(--b3-theme-error); background: color-mix(in srgb, var(--b3-theme-error) 7%, transparent); font-size: 13px; line-height: 1.45; overflow-wrap: anywhere; }
    .settings-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 14px; border-top: 1px solid var(--b3-border-color); flex-shrink: 0; }
</style>
