<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
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
        if (!state || isLoading || isSaving || state.status === "initializing") return;

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

    function statusLabel(value: McpRuntimeState): string {
        if (value.status === "enabled" && value.enabled && value.active) {
            return tx("settingsMcpStatusEnabled", "已开启");
        }
        if (value.status === "error") return tx("settingsMcpStatusError", "Kernel 服务异常");
        if (value.status === "initializing") return tx("settingsMcpStatusNotReady", "Kernel 服务未就绪");
        return tx("settingsMcpStatusDisabled", "已关闭");
    }

    function statusIcon(value: McpRuntimeState): string {
        if (value.status === "enabled" && value.active) return "success";
        if (value.status === "error") return "error";
        if (value.status === "initializing") return "warning";
        return "info";
    }

    function getErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error || tx("uiUnknownError", "未知错误"));
    }
</script>

<div class="settings-dialog settings-dialog-mcp">
    <header class="settings-dialog-header">
        <div class="settings-dialog-icon"><SiYuanIcon name="plugin" size={20} /></div>
        <div>
            <h2>{tx("settingsMcpTitle", "MCP 服务")}</h2>
            <p>{tx("settingsMcpDesc", "允许外部 AI/MCP 客户端通过思源内置 /mcp 读取本插件提供的读书数据。")}</p>
        </div>
    </header>

    {#if isLoading}
        <div class="settings-dialog-loading" aria-live="polite">{tx("uiLoading", "加载中...")}</div>
    {:else if !state}
        <div class="settings-dialog-error" role="alert">
            <strong>{tx("settingsMcpLoadFailed", "无法读取 MCP Kernel 状态")}</strong>
            <span>{errorMessage || tx("settingsMcpKernelNotReady", "Kernel 服务未就绪，请稍后重试。")}</span>
            <button type="button" class="b3-button b3-button--outline" on:click={loadState} disabled={isLoading}>
                {tx("settingsMcpRetry", "重试")}
            </button>
        </div>
    {:else}
        <div class="settings-dialog-body">
            <label class="settings-dialog-switch-row" for="mcp-enabled">
                <span>
                    <strong>{tx("settingsMcpEnable", "启用 MCP 服务")}</strong>
                    <em>{tx("settingsMcpDefaultOff", "本功能默认关闭，需要在这里主动开启。")}</em>
                </span>
                <input
                    id="mcp-enabled"
                    type="checkbox"
                    class="settings-switch"
                    bind:checked={draftEnabled}
                    disabled={isSaving || state.status === "initializing"}
                    aria-describedby="mcp-readonly-note"
                />
                <span class="settings-switch-track"><span class="settings-switch-thumb"></span></span>
            </label>

            <div
                class:settings-dialog-status-ok={state.status === "enabled" && state.active}
                class:settings-dialog-status-warn={state.status === "error" || state.status === "initializing"}
                class="settings-dialog-status"
                aria-live="polite"
            >
                <SiYuanIcon name={statusIcon(state)} size={18} />
                <div>
                    <strong>{tx("settingsMcpCurrentStatus", "当前状态")}: {statusLabel(state)}</strong>
                    <span>{tx("settingsMcpCapabilityCount", "当前已注册 {count} / {expected} 个只读能力", {
                        count: state.capabilityCount,
                        expected: state.expectedCapabilityCount,
                    })}</span>
                </div>
            </div>

            {#if state.lastError}
                <div class="settings-dialog-error" role="alert">
                    <strong>{tx("settingsMcpError", "MCP 服务错误")}</strong>
                    <span>{state.lastError}</span>
                </div>
            {/if}

            <p id="mcp-readonly-note" class="settings-dialog-note">
                <strong>{tx("settingsMcpReadOnlyTitle", "当前阶段仅支持只读")}</strong>
                {tx("settingsMcpReadOnly", "只能查询、搜索、统计和诊断；不允许修改读书笔记，也不会触发微信读书同步。")}
            </p>
            <p class="settings-dialog-note">{tx("settingsMcpConnection", "外部客户端连接的是思源自身的 /mcp，不是插件独立端口。")}</p>
            <p class="settings-dialog-note">{tx("settingsMcpAuthentication", "认证继续由思源控制；本插件不会显示或创建 API Token。")}</p>

            {#if errorMessage}
                <div class="settings-dialog-error" role="alert">{errorMessage}</div>
            {/if}
        </div>
    {/if}

    <footer class="settings-dialog-actions">
        <button type="button" class="b3-button b3-button--outline" on:click={close}>{t(plugin, "cancel", "取消")}</button>
        <button
            type="button"
            class="b3-button b3-button--primary"
            on:click={save}
            disabled={isLoading || isSaving || !state || state.status === "initializing"}
        >{tx("uiSave", "保存")}</button>
    </footer>
</div>

<style>
    .settings-dialog { display: flex; flex-direction: column; gap: 16px; padding: 18px; color: var(--b3-theme-on-background); background: var(--b3-theme-background); width: 100%; height: 100%; box-sizing: border-box; overflow: auto; min-width: 0; }
    .settings-dialog-header { display: flex; gap: 12px; align-items: flex-start; padding-bottom: 14px; border-bottom: 1px solid var(--b3-border-color); flex-shrink: 0; }
    .settings-dialog-header > div:last-child { display: grid; justify-items: start; gap: 4px; min-width: 0; }
    .settings-dialog-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 8px; color: var(--b3-theme-primary); background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent); flex: 0 0 auto; }
    h2 { margin: 0 0 4px; font-size: 18px; line-height: 1.2; }
    p { margin: 0; color: var(--b3-theme-on-surface-light); font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
    .settings-dialog-body { display: grid; gap: 14px; flex: 1; min-height: 0; overflow: auto; }
    .settings-dialog-switch-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 8px; background: var(--b3-theme-surface); }
    .settings-dialog-switch-row span:first-child { display: grid; gap: 3px; min-width: 0; }
    .settings-dialog-switch-row strong { font-size: 13px; }
    .settings-dialog-switch-row em { color: var(--b3-theme-on-surface-light); font-size: 12px; font-style: normal; line-height: 1.4; }
    .settings-dialog-switch-row:has(input:disabled) { cursor: not-allowed; opacity: .7; }
    .settings-dialog-status { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--b3-border-color); font-size: 13px; }
    .settings-dialog-status > div { display: grid; gap: 3px; min-width: 0; }
    .settings-dialog-status span { color: var(--b3-theme-on-surface-light); font-size: 12px; }
    .settings-dialog-status-ok { color: var(--b3-theme-primary); background: color-mix(in srgb, var(--b3-theme-primary) 8%, transparent); }
    .settings-dialog-status-warn { color: var(--b3-theme-error); background: color-mix(in srgb, var(--b3-theme-error) 8%, transparent); }
    .settings-dialog-note { padding: 0 2px; }
    .settings-dialog-note strong { color: var(--b3-theme-on-background); }
    .settings-dialog-loading { padding: 32px; text-align: center; color: var(--b3-theme-on-surface-light); }
    .settings-dialog-error { display: grid; gap: 6px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--b3-theme-error) 45%, var(--b3-border-color)); border-radius: 8px; color: var(--b3-theme-error); background: color-mix(in srgb, var(--b3-theme-error) 7%, transparent); font-size: 13px; line-height: 1.45; overflow-wrap: anywhere; }
    .settings-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 14px; border-top: 1px solid var(--b3-border-color); flex-shrink: 0; }
</style>
