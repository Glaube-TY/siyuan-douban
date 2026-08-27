import { fetchSyncPost, showMessage } from "siyuan";
import type { EventBus, IWebSocketData } from "siyuan";
import { svelteDialog } from "../../../libs/dialog";
import WereadManualSyncModeDialog from "../../../components/common/WereadManualSyncModeDialog.svelte";
import { autoSyncWereadApi } from "./autoSyncWereadApi";
import { formatWereadApiAutoSyncResultSummary } from "./formatWereadApiSyncResult";
import { loadWereadAuthState } from "../../settings/wereadSettingsService";
import {
    WEREAD_DEVICE_SETTINGS_CHANGED_EVENT,
    loadWereadDeviceSettings,
} from "../../settings/wereadDeviceSettingsService";
import { localizeKnownUiText } from "../../i18n";
import { tryRunWereadSync } from "./wereadSyncRunGuard";

export const WEREAD_AUTO_SYNC_AFTER_SIYUAN_DELAY_MS = 5000;
const SIYUAN_SYNC_CONFIG_UNKNOWN_MESSAGE = "无法确认思源同步设置，暂不执行微信读书自动同步。";

type ManualSyncModeDecision = "undecided" | "continue" | "wait";

type WereadAutoSyncPlugin = {
    name: string;
    isMobile?: boolean;
    eventBus: EventBus;
    loadData: (key: string) => Promise<any>;
    saveData: (key: string, value: any) => Promise<void>;
    i18n: Record<string, string>;
};

export class WereadAutoSyncCoordinator {
    private initialized = false;
    private layoutReady = false;
    private siyuanSyncInProgress = false;
    private siyuanSyncCompletedThisSession = false;
    private autoSyncScheduled = false;
    private autoSyncRunning = false;
    private autoSyncAttemptedThisSession = false;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private bootSyncInspectionInProgress = false;
    private manualSyncModeDecision: ManualSyncModeDecision = "undecided";
    private manualSyncModeDialogOpen = false;
    private manualSyncModeDialog: { close: () => void } | null = null;
    private ignoreNextManualDialogClose = false;
    private destroyed = false;

    private readonly handleSyncStart = (_event: CustomEvent<IWebSocketData>) => {
        this.siyuanSyncInProgress = true;
        this.cancelScheduledAutoSync();
        if (this.manualSyncModeDialogOpen) {
            this.manualSyncModeDecision = "wait";
        }
        this.closeManualSyncModeDialog();
    };

    private readonly handleSyncEnd = (_event: CustomEvent<IWebSocketData>) => {
        this.siyuanSyncInProgress = false;
        this.siyuanSyncCompletedThisSession = true;
        if (this.manualSyncModeDecision === "wait") {
            this.manualSyncModeDecision = "undecided";
        }
        this.closeManualSyncModeDialog();
        this.scheduleAutoSyncIfReady();
    };

    private readonly handleSyncFail = (_event: CustomEvent<IWebSocketData>) => {
        this.siyuanSyncInProgress = false;
        this.siyuanSyncCompletedThisSession = false;
        this.manualSyncModeDecision = "wait";
        this.cancelScheduledAutoSync();
        this.closeManualSyncModeDialog();
    };

    private readonly handleDeviceSettingsChanged = (event: Event) => {
        const autoSync = (event as CustomEvent<{ autoSync?: unknown }>).detail?.autoSync;
        if (autoSync === false) {
            this.cancelScheduledAutoSync();
            this.manualSyncModeDecision = "undecided";
            this.closeManualSyncModeDialog();
            return;
        }
        if (autoSync === true) {
            this.scheduleAutoSyncIfReady();
        }
    };

    constructor(private readonly plugin: WereadAutoSyncPlugin) {
        this.initialized = true;
        this.plugin.eventBus.on("sync-start", this.handleSyncStart);
        this.plugin.eventBus.on("sync-end", this.handleSyncEnd);
        this.plugin.eventBus.on("sync-fail", this.handleSyncFail);
        if (typeof window !== "undefined") {
            window.addEventListener(WEREAD_DEVICE_SETTINGS_CHANGED_EVENT, this.handleDeviceSettingsChanged);
        }
    }

    async markLayoutReady(): Promise<void> {
        if (this.destroyed || this.layoutReady) return;

        this.layoutReady = true;
        this.bootSyncInspectionInProgress = true;
        try {
            await this.inspectBootSyncState();
        } finally {
            this.bootSyncInspectionInProgress = false;
        }
        this.scheduleAutoSyncIfReady();
    }

    destroy(): void {
        if (this.destroyed) return;

        this.destroyed = true;
        this.initialized = false;
        this.cancelScheduledAutoSync();
        this.closeManualSyncModeDialog();
        this.plugin.eventBus.off("sync-start", this.handleSyncStart);
        this.plugin.eventBus.off("sync-end", this.handleSyncEnd);
        this.plugin.eventBus.off("sync-fail", this.handleSyncFail);
        if (typeof window !== "undefined") {
            window.removeEventListener(WEREAD_DEVICE_SETTINGS_CHANGED_EVENT, this.handleDeviceSettingsChanged);
        }
    }

    private readSiyuanSyncConfig(): { enabled?: boolean; mode?: number } {
        const sync = typeof window !== "undefined" ? window.siyuan?.config?.sync : undefined;
        return {
            enabled: typeof sync?.enabled === "boolean" ? sync.enabled : undefined,
            mode: typeof sync?.mode === "number" && Number.isFinite(sync.mode) ? sync.mode : undefined,
        };
    }

    private isDeviceAutoSyncEnabled(): boolean {
        return loadWereadDeviceSettings().autoSync;
    }

    private async inspectBootSyncState(): Promise<void> {
        const { enabled, mode } = this.readSiyuanSyncConfig();
        if (enabled === false) {
            return;
        }

        if (enabled !== true || mode === undefined) {
            this.siyuanSyncCompletedThisSession = false;
            console.warn("[siyuan-douban] 无法确认思源启动同步状态，等待下一次 sync-end");
            return;
        }

        if (mode === 3) {
            return;
        }

        try {
            const response = await fetchSyncPost("/api/sync/getBootSync", {});
            const code = response && typeof response === "object" && "code" in response
                ? (response as { code?: unknown }).code
                : undefined;
            if (code === 0) {
                this.siyuanSyncCompletedThisSession = true;
                return;
            }

            this.siyuanSyncCompletedThisSession = false;
            if (code !== 1) {
                console.warn("[siyuan-douban] 无法确认思源启动同步状态，等待下一次 sync-end", response);
            }
        } catch (error) {
            this.siyuanSyncCompletedThisSession = false;
            console.warn("[siyuan-douban] 无法确认思源启动同步状态，等待下一次 sync-end", error);
        }
    }

    private scheduleAutoSyncIfReady(): void {
        if (
            !this.initialized
            || this.destroyed
            || !this.layoutReady
            || this.bootSyncInspectionInProgress
            || !this.isDeviceAutoSyncEnabled()
            || this.siyuanSyncInProgress
            || this.autoSyncRunning
            || this.autoSyncAttemptedThisSession
            || this.autoSyncScheduled
            || this.manualSyncModeDialogOpen
        ) {
            return;
        }

        const { enabled, mode } = this.readSiyuanSyncConfig();
        if (enabled === false) {
            this.scheduleAutoSyncTimer();
            return;
        }

        if (enabled !== true || mode === undefined) {
            console.warn(`[siyuan-douban] ${SIYUAN_SYNC_CONFIG_UNKNOWN_MESSAGE}`);
            return;
        }

        if (mode === 3) {
            if (this.siyuanSyncCompletedThisSession || this.manualSyncModeDecision === "continue") {
                this.scheduleAutoSyncTimer();
            } else if (this.manualSyncModeDecision === "wait") {
                return;
            } else {
                this.promptManualSyncModeDecision();
            }
            return;
        }

        if (this.siyuanSyncCompletedThisSession) {
            this.scheduleAutoSyncTimer();
        }
    }

    private scheduleAutoSyncTimer(): void {
        this.autoSyncScheduled = true;
        this.timer = setTimeout(() => {
            this.timer = null;
            this.autoSyncScheduled = false;
            void this.runAutoSync();
        }, WEREAD_AUTO_SYNC_AFTER_SIYUAN_DELAY_MS);
    }

    private promptManualSyncModeDecision(): void {
        if (
            this.destroyed
            || !this.layoutReady
            || !this.isDeviceAutoSyncEnabled()
            || this.manualSyncModeDialogOpen
            || this.manualSyncModeDecision !== "undecided"
            || this.autoSyncRunning
            || this.autoSyncAttemptedThisSession
        ) {
            return;
        }

        const isMobileViewport = !!this.plugin.isMobile
            || (typeof window !== "undefined" && window.matchMedia?.("(max-width: 600px)").matches);
        this.manualSyncModeDialogOpen = true;
        let dialogRef: ReturnType<typeof svelteDialog> | null = null;
        try {
            dialogRef = svelteDialog({
                title: this.plugin.i18n.wereadAutoSyncManualModeTitle || "思源当前为完全手动同步模式",
                width: isMobileViewport ? "100vw" : "min(520px, 92vw)",
                height: isMobileViewport ? "100dvh" : undefined,
                disableClose: false,
                hideCloseIcon: false,
                constructor: (container: HTMLElement) => new WereadManualSyncModeDialog({
                    target: container,
                    props: {
                        plugin: this.plugin,
                        onContinue: () => this.handleManualSyncModeContinue(),
                        onWait: () => this.handleManualSyncModeWait(),
                    },
                }),
                callback: () => {
                    const isCurrentDialog = this.manualSyncModeDialog === dialogRef;
                    if (isCurrentDialog) {
                        this.manualSyncModeDialog = null;
                        this.manualSyncModeDialogOpen = false;
                    }
                    if (this.ignoreNextManualDialogClose) {
                        this.ignoreNextManualDialogClose = false;
                        return;
                    }
                    if (isCurrentDialog && this.manualSyncModeDecision === "undecided") {
                        this.manualSyncModeDecision = "wait";
                        this.cancelScheduledAutoSync();
                    }
                },
            });
            this.manualSyncModeDialog = dialogRef;
            if (isMobileViewport) {
                dialogRef.dialog.element.classList.add("siyuan-douban-mobile-subdialog");
            }
        } catch (error) {
            this.manualSyncModeDialogOpen = false;
            console.error("[siyuan-douban] 打开完全手动同步模式确认弹窗失败", error);
        }
    }

    private handleManualSyncModeContinue(): void {
        if (this.manualSyncModeDecision !== "undecided") return;

        this.manualSyncModeDecision = "continue";
        this.closeManualSyncModeDialog();
        this.scheduleAutoSyncIfReady();
    }

    private handleManualSyncModeWait(): void {
        if (this.manualSyncModeDecision !== "undecided") return;

        this.manualSyncModeDecision = "wait";
        this.cancelScheduledAutoSync();
        this.closeManualSyncModeDialog();
    }

    private cancelScheduledAutoSync(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.autoSyncScheduled = false;
    }

    private closeManualSyncModeDialog(): void {
        const dialog = this.manualSyncModeDialog;
        this.manualSyncModeDialog = null;
        this.manualSyncModeDialogOpen = false;
        if (!dialog) return;

        this.ignoreNextManualDialogClose = true;
        dialog.close();
    }

    private canRunAutoSyncWithCurrentSiyuanState(): boolean {
        const { enabled, mode } = this.readSiyuanSyncConfig();
        if (enabled === false) {
            return true;
        }
        if (enabled !== true || mode === undefined) {
            console.warn(`[siyuan-douban] ${SIYUAN_SYNC_CONFIG_UNKNOWN_MESSAGE}`);
            return false;
        }
        if (mode === 3) {
            return this.siyuanSyncCompletedThisSession || this.manualSyncModeDecision === "continue";
        }
        return this.siyuanSyncCompletedThisSession;
    }

    private async runAutoSync(): Promise<void> {
        if (
            this.destroyed
            || !this.initialized
            || !this.layoutReady
            || this.siyuanSyncInProgress
            || this.autoSyncRunning
            || this.autoSyncAttemptedThisSession
        ) {
            return;
        }

        if (!this.isDeviceAutoSyncEnabled()) {
            return;
        }

        if (!this.canRunAutoSyncWithCurrentSiyuanState()) {
            return;
        }

        this.autoSyncAttemptedThisSession = true;
        this.autoSyncRunning = true;
        try {
            await tryRunWereadSync("auto", async () => {
                const auth = await loadWereadAuthState(this.plugin);
                if (!auth.verified || !auth.apiKey) {
                    showMessage(this.plugin.i18n.wereadVerifyApiKeyFirst || "请先验证微信读书 API Key");
                    return;
                }

                if (
                    this.destroyed
                    || !this.isDeviceAutoSyncEnabled()
                    || this.siyuanSyncInProgress
                ) {
                    return;
                }
                if (!this.canRunAutoSyncWithCurrentSiyuanState()) {
                    return;
                }

                try {
                    showMessage(this.plugin.i18n.wereadApiAutoSyncStart || "微信读书自动同步开始");
                    const result = await autoSyncWereadApi(this.plugin);
                    const summary = formatWereadApiAutoSyncResultSummary(result, { maxTitles: 3, i18nSource: this.plugin });
                    showMessage(summary || (this.plugin.i18n.wereadApiAutoSyncSuccess || "微信读书自动同步完成"));
                } catch (error: any) {
                    showMessage(`${this.plugin.i18n.wereadApiAutoSyncFailed || "微信读书自动同步失败"}：${localizeKnownUiText(this.plugin, error?.message || "")}`);
                }
            });
        } catch (error: any) {
            showMessage(`${this.plugin.i18n.wereadApiAutoSyncFailed || "微信读书自动同步失败"}：${localizeKnownUiText(this.plugin, error?.message || "")}`);
        } finally {
            this.autoSyncRunning = false;
        }
    }
}
