import { Plugin, IModel, showMessage, getFrontend } from "siyuan";

import firstPage from "./components/common/firstDialog.svelte";
import setPage from "./components/index.svelte";

import { svelteDialog } from "./libs/dialog";
import { loadPluginData, DEFAULT_WEREAD_SETTINGS, DEFAULT_WEREAD_AUTH_SETTINGS } from "./utils/core/configDefaults";
import { autoSyncWereadApi } from "./utils/weread/api/autoSyncWereadApi";
import { formatWereadApiAutoSyncResultSummary } from "./utils/weread/api/formatWereadApiSyncResult";

const STORAGE_NAME = "menu-config";

export default class PluginDouban extends Plugin {

    isMobile: boolean;

    customTab: () => IModel;

    async onload() {
        this.data[STORAGE_NAME] = { readonlyText: "Readonly" };

        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";

        await this.loadData(STORAGE_NAME);

        this.addIcons(`<symbol id="iconNotebook" viewBox="0 0 1024 1024"><path d="M784 260.266667h145.066667v208.853333h-145.066667zM784 522.026667h145.066667v208.853333h-145.066667zM784 784h145.066667V960h-145.066667zM929.066667 207.36V64h-145.066667v143.36h145.066667z" fill="#A25C11" p-id="18569"></path><path d="M133.546667 64c-21.12 0-38.613333 16.64-38.613334 36.906667v822.4c0 20.266667 17.28 36.906667 38.613334 36.906666h580.48V64H133.546667z m260.906666 523.52h-130.986666c-14.506667 0-26.453333-11.946667-26.453334-26.453333V168.32c0-14.506667 11.946667-26.453333 26.453334-26.453333h130.986666c14.506667 0 26.453333 11.946667 26.453334 26.453333V561.066667c0 14.72-11.946667 26.453333-26.453334 26.453333z" fill="#333333" p-id="18570"></path><path d="M290.133333 194.773333h77.866667v339.626667H290.133333z" fill="#A25C11" p-id="18571"></path></symbol>`);

        this.addTopBar({
            icon: "iconNotebook",
            title: this.i18n.addTopBarIcon,
            position: "right",
            callback: async () => {
                await this.loadData("INTP").then(async (INTP) => {
                    if (!INTP) {
                        this.showFirstDialog();
                        return;
                    } else if (INTP.isFirstLoad) {
                        this.showFirstDialog();
                        return;
                    } else {
                        this.showSetDialog();
                    }
                });
            }
        });

        this.registerCommand();
    }

    async onLayoutReady() {
        const wereadSetting = await loadPluginData(this, "weread_settings", DEFAULT_WEREAD_SETTINGS);
        const autoSync = wereadSetting.autoSync;

        if (!autoSync) {
            return;
        }

        const auth = await loadPluginData(this, "weread_auth_settings", DEFAULT_WEREAD_AUTH_SETTINGS);

        if (auth.verified && auth.apiKey) {
            try {
                showMessage(this.i18n.wereadApiAutoSyncStart || "微信读书自动同步开始");
                const result = await autoSyncWereadApi(this);
                const summary = formatWereadApiAutoSyncResultSummary(result, { maxTitles: 3 });
                showMessage(summary || (this.i18n.wereadApiAutoSyncSuccess || "微信读书自动同步完成"));
            } catch (error: any) {
                showMessage(`${this.i18n.wereadApiAutoSyncFailed || "微信读书自动同步失败"}：${error?.message || ""}`);
            }
            return;
        }

        showMessage("请先验证微信读书 API Key");
    }

    private showFirstDialog() {
        const dialogRef = svelteDialog({
            title: "",
            width: "auto",
            constructor: (container: HTMLElement) => {
                return new firstPage({
                    target: container,
                    props: {
                        plugin: this,
                        onClose: () => {
                            dialogRef.close();
                        },
                        onContinue: () => {
                            this.showSetDialog();
                            dialogRef.close();
                        },
                        onNeverNotice: async () => {
                            await this.saveData("INTP", { "isFirstLoad": false });
                            showMessage(this.i18n.showMessage41);
                            this.showSetDialog();
                            dialogRef.close();
                        },
                    }
                });
            }
        });
    }

    private showSetDialog() {
        const dialogRef = svelteDialog({
            title: "",
            width: "900px",
            height: "720px",
            constructor: (container: HTMLElement) => {
                return new setPage({
                    target: container,
                    props: {
                        i18n: this.i18n,
                        plugin: this,
                    }
                });
            }
        });
        dialogRef.dialog.element.classList.add("siyuan-douban-settings-dialog");
        this.lockSettingsDialogOuterScroll(dialogRef.dialog.element);
        (this as any).closeSettingsDialog = () => {
            dialogRef?.close?.();
        };
        const originalClose = dialogRef.close?.bind(dialogRef);
        dialogRef.close = () => {
            originalClose?.();
            if ((this as any).closeSettingsDialog) {
                (this as any).closeSettingsDialog = null;
            }
        };
    }

    private lockSettingsDialogOuterScroll(dialogElement: HTMLElement) {
        const apply = () => {
            dialogElement.classList.add("siyuan-douban-settings-dialog");
            dialogElement.style.overflow = "hidden";
            dialogElement.style.minHeight = "0";

            const outerSelectors = [
                ".b3-dialog",
                ".b3-dialog__container",
                ".b3-dialog__body",
                ".b3-dialog__content",
                ".dialog-content",
            ];

            dialogElement.querySelectorAll<HTMLElement>(outerSelectors.join(",")).forEach((el) => {
                el.style.overflow = "hidden";
                el.style.minHeight = "0";
                el.style.boxSizing = "border-box";
            });

            const contentEls = dialogElement.querySelectorAll<HTMLElement>(".b3-dialog__content, .dialog-content");
            contentEls.forEach((el) => {
                el.style.height = "100%";
                el.style.display = "flex";
                el.style.flexDirection = "column";
            });

            const layout = dialogElement.querySelector<HTMLElement>(".plugin-settings-layout");
            if (layout) {
                layout.style.height = "100%";
                layout.style.minHeight = "0";
                layout.style.overflow = "hidden";
            }

            const main = dialogElement.querySelector<HTMLElement>(".plugin-settings-main");
            if (main) {
                main.style.flex = "1";
                main.style.minHeight = "0";
                main.style.overflowY = "auto";
                main.style.overflowX = "hidden";
            }
        };

        apply();
        requestAnimationFrame(apply);
        window.setTimeout(apply, 50);
    }

    private registerCommand() {
        // 添加快速打开读书笔记插件的快捷键命令
        this.addCommand({
            langKey: "打开读书笔记",
            hotkey: "⌘⇧;",
            callback: () => {
                // 检查是否为移动端
                if (this.isMobile) {
                    showMessage("❌移动端不支持快捷键开启");
                    return;
                } else {
                    // 桌面端打开方式
                    this.showSetDialog();
                }
            },
        });
    }
}