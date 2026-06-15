import { Plugin, IModel, showMessage, getFrontend, openTab } from "siyuan";

import firstPage from "./components/common/firstDialog.svelte";
import setPage from "./components/index.svelte";
import ReadingCenter from "./components/readingCenter/ReadingCenter.svelte";

import { svelteDialog } from "./libs/dialog";
import { loadPluginData, DEFAULT_WEREAD_SETTINGS } from "./utils/core/configDefaults";
import { autoSyncWereadApi } from "./utils/weread/api/autoSyncWereadApi";
import { formatWereadApiAutoSyncResultSummary } from "./utils/weread/api/formatWereadApiSyncResult";
import { loadWereadAuthState } from "./utils/settings/wereadSettingsService";

const STORAGE_NAME = "menu-config";

// 自定义标签页常量
const TAB_TYPE = "siyuan_douban_reading_center_tab";

export default class PluginDouban extends Plugin {

    isMobile: boolean;

    customTab: () => IModel;

    // 读书笔记标签页相关字段
    private readingCenterTabContainer: HTMLElement | null = null;
    private readingCenterInstance: InstanceType<typeof ReadingCenter> | null = null;
    private readingCenterTabObserver: MutationObserver | null = null;
    private isOpeningReadingCenterTab: boolean = false;

    async onload() {
        this.data[STORAGE_NAME] = { readonlyText: "Readonly" };

        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";

        await this.loadData(STORAGE_NAME);

        this.addIcons(`<symbol id="iconNotebook" viewBox="0 0 1024 1024"><path d="M784 260.266667h145.066667v208.853333h-145.066667zM784 522.026667h145.066667v208.853333h-145.066667zM784 784h145.066667V960h-145.066667zM929.066667 207.36V64h-145.066667v143.36h145.066667z" fill="#A25C11" p-id="18569"></path><path d="M133.546667 64c-21.12 0-38.613333 16.64-38.613334 36.906667v822.4c0 20.266667 17.28 36.906667 38.613334 36.906666h580.48V64H133.546667z m260.906666 523.52h-130.986666c-14.506667 0-26.453333-11.946667-26.453334-26.453333V168.32c0-14.506667 11.946667-26.453333 26.453334-26.453333h130.986666c14.506667 0 26.453333 11.946667 26.453334 26.453333V561.066667c0 14.72-11.946667 26.453333-26.453334 26.453333z" fill="#333333" p-id="18570"></path><path d="M290.133333 194.773333h77.866667v339.626667H290.133333z" fill="#A25C11" p-id="18571"></path></symbol>`);

        // 注册自定义标签页
        this.registerReadingCenterTab();

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
                        // 桌面端打开自定义标签页
                        if (!this.isMobile) {
                            this.openReadingCenterTab();
                        } else {
                            // 移动端保持原逻辑
                            this.showSetDialog();
                        }
                    }
                });
            }
        });

        this.registerCommand();
    }

    async onLayoutReady() {
        // 继续原有自动同步逻辑
        const wereadSetting = await loadPluginData(this, "weread_settings", DEFAULT_WEREAD_SETTINGS);
        const autoSync = wereadSetting.autoSync;

        if (!autoSync) {
            return;
        }

        const auth = await loadWereadAuthState(this);

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

    onunload() {
        // 清理标签页组件实例
        this.destroyReadingCenterInstance();

        // 清空容器引用
        this.readingCenterTabContainer = null;
    }

    /**
     * 注册自定义标签页
     * 使用普通函数确保 this 指向 tab model，可正确获取 this.element
     */
    private registerReadingCenterTab() {
        const plugin = this;
        this.customTab = this.addTab({
            type: TAB_TYPE,
            init() {
                // this 指向 ICustomModel / ITabModel，有 element 属性
                if (!this.element) return;
                plugin.createReadingCenterInstance(this.element);
            },
            beforeDestroy() {
                plugin.destroyReadingCenterInstance();
            },
            destroy() {
                plugin.destroyReadingCenterInstance();
            },
        });
    }

    /**
     * 创建读书笔记组件实例
     */
    private createReadingCenterInstance(tabElement: HTMLElement) {
        // 如果已有实例，先销毁
        this.destroyReadingCenterInstance();

        if (!tabElement) {
            return;
        }

        this.readingCenterTabContainer = tabElement;

        // 创建容器 div
        const container = document.createElement('div');
        container.className = 'siyuan-douban-reading-center-tab';
        container.style.height = '100%';
        container.style.overflow = 'auto';
        this.readingCenterTabContainer.appendChild(container);

        // 创建 Svelte 组件实例
        this.readingCenterInstance = new ReadingCenter({
            target: container,
            props: {
                i18n: this.i18n,
                plugin: this,
            }
        });

        // 设置 MutationObserver 监听 document.body，检测容器是否脱离 DOM
        this.readingCenterTabObserver = new MutationObserver(() => {
            if (container && !container.isConnected) {
                this.destroyReadingCenterInstance();
            }
        });

        this.readingCenterTabObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    /**
     * 销毁读书笔记组件实例
     */
    private destroyReadingCenterInstance() {
        if (this.readingCenterTabObserver) {
            this.readingCenterTabObserver.disconnect();
            this.readingCenterTabObserver = null;
        }

        if (this.readingCenterInstance) {
            this.readingCenterInstance.$destroy();
            this.readingCenterInstance = null;
        }

        if (this.readingCenterTabContainer) {
            this.readingCenterTabContainer.innerHTML = '';
        }
    }

    /**
     * 获取读书笔记标签页唯一标识 ID
     * 供 openTab custom.id 使用，思源通过 custom.id 匹配已有 tab model 的 type 实现复用
     */
    private getReadingCenterCustomId(): string {
        return this.name + TAB_TYPE;
    }

    /**
     * 获取读书笔记标签页稳定自定义数据
     * 每次调用必须返回深度相等的数据对象，不能包含时间戳、随机数、函数、DOM 对象
     * 思源前端通过比较 custom.data 判断是否为同一标签页
     */
    private getReadingCenterCustomData(): object {
        return {
            plugin: this.name,
            view: "reading-center",
            type: TAB_TYPE
        };
    }

    /**
     * 尝试聚焦已打开的读书笔记标签页（DOM 兜底方案）
     * 优先依赖 openTab 自身的复用能力；本方法仅在 DOM 层面兜底
     * @returns true 表示成功聚焦，false 表示未找到
     */
    private focusExistingReadingCenterTab(): boolean {
        const tabItems = document.querySelectorAll('.layout-tab-bar .item');

        // 第一轮：通过 data-initdata 中的 customModelData 深度匹配
        const expectedData = JSON.stringify(this.getReadingCenterCustomData());
        for (const item of Array.from(tabItems)) {
            const el = item as HTMLElement;
            const initData = el.getAttribute('data-initdata');
            if (initData) {
                try {
                    const parsed = JSON.parse(initData);
                    const customData = parsed?.customModelData;
                    if (customData && JSON.stringify(customData) === expectedData) {
                        el.click();
                        return true;
                    }
                } catch {
                    // 解析失败则跳过，继续尝试其他匹配方式
                }
            }
        }

        // 第二轮：通过标题文本匹配（兜底，需排除普通文档标签页）
        for (const item of Array.from(tabItems)) {
            const el = item as HTMLElement;
            const titleSpan = el.querySelector('.item__text');
            if (titleSpan && titleSpan.textContent === '读书笔记') {
                // 自定义标签页才有 data-initdata，普通文档标签页没有
                const initData = el.getAttribute('data-initdata');
                if (initData) {
                    el.click();
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * 打开读书笔记标签页
     * 通过正确的 custom.id（this.name + TAB_TYPE）让思源自动复用已有标签页
     * custom.data 使用固定唯一稳定对象，确保思源能正确识别同一标签页
     * isOpeningReadingCenterTab 锁防止快速连点导致竞态
     */
    private async openReadingCenterTab() {
        // 移动端保持原逻辑
        if (this.isMobile) {
            showMessage("移动端暂不支持读书笔记标签页");
            return;
        }

        // DOM 兜底：尝试聚焦已打开的标签页
        if (this.focusExistingReadingCenterTab()) {
            return;
        }

        // 防止快速连续点击
        if (this.isOpeningReadingCenterTab) {
            return;
        }

        this.isOpeningReadingCenterTab = true;
        try {
            await openTab({
                app: this.app,
                custom: {
                    icon: "iconNotebook",
                    title: "读书笔记",
                    data: this.getReadingCenterCustomData(),
                    id: this.getReadingCenterCustomId(),
                },
            });
        } finally {
            // 延迟释放锁，防止 openTab 过程中重复触发
            // 800ms 足够 openTab 完成，同时防止快速连点
            setTimeout(() => {
                this.isOpeningReadingCenterTab = false;
            }, 800);
        }
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
                            // 打开自定义标签页而非设置弹窗
                            this.openReadingCenterTab();
                            dialogRef.close();
                        },
                        onNeverNotice: async () => {
                            await this.saveData("INTP", { "isFirstLoad": false });
                            showMessage(this.i18n.showMessage41);
                            // 打开自定义标签页而非设置弹窗
                            this.openReadingCenterTab();
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
                    // 桌面端打开自定义标签页
                    this.openReadingCenterTab();
                }
            },
        });
    }
}
