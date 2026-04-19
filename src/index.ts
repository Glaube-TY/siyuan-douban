import { Plugin, IModel, showMessage, getFrontend } from "siyuan";

import firstPage from "./components/common/firstDialog.svelte";
import setPage from "./components/index.svelte";

import { svelteDialog } from "./libs/dialog";
import * as sdk from "@siyuan-community/siyuan-sdk";
import { syncWereadNotes } from "./utils/weread/syncWereadNotes";
import { loadPluginData, DEFAULT_WEREAD_SETTINGS, DEFAULT_WEREAD_COOKIE } from "./utils/core/configDefaults";
import {
    createWereadQRCodeDialog,
    checkWrVid,
    verifyCookie,
} from "@/utils/weread/loginWeread";
import {
    getNotebooks,
    getBook,
} from "@/utils/weread/wereadInterface";
import PromiseLimitPool from "./libs/promise-pool";
import type { WereadBookSummary, WereadBookDetail } from "./utils/weread/types";
import { isWereadMpAccountSource } from "./utils/weread/mpArticleSync";

const BOOK_DETAILS_CONCURRENCY = 4;

// 本地扩展类型，用于访问公众号账号特有的元数据字段
type WereadBookDetailWithMpMeta = WereadBookDetail & { type?: number; coverBoxInfo?: { mp_avatar?: string } };

async function buildTemporaryNotebookList(plugin: PluginDouban, cookies: string, bookCache: Map<string, Promise<WereadBookDetail>>): Promise<WereadBookSummary[]> {
    const notebookdata = await getNotebooks(plugin, cookies);
    const basicBooks = notebookdata.books;
    const pool = new PromiseLimitPool<WereadBookSummary>(BOOK_DETAILS_CONCURRENCY);
    const getBookCached = (bookId: string) => {
        if (bookCache.has(bookId)) {
            return bookCache.get(bookId)!;
        }
        const promise = getBook(plugin, cookies, bookId);
        bookCache.set(bookId, promise);
        return promise;
    };
    for (const b of basicBooks) {
        pool.add(async () => {
            const details = await getBookCached(b.bookId);
            const detailsWithMpMeta = details as WereadBookDetailWithMpMeta;

            // 判定来源类型
            const isMpAccount = isWereadMpAccountSource(details.bookId, detailsWithMpMeta);
            const sourceType = isMpAccount ? "weread_mp_account" : "weread_book";

            // 处理封面：公众号账号在默认占位封面场景下回退到 mp_avatar
            let cover = details.cover || "";
            if (isMpAccount && (!cover || cover.includes("/t8_0.jpg"))) {
                cover = detailsWithMpMeta.coverBoxInfo?.mp_avatar || cover;
            }

            return {
                sourceType,
                noteCount: b.noteCount,
                reviewCount: b.reviewCount,
                updatedTime: b.sort,
                bookID: details.bookId,
                title: details.title,
                author: details.author,
                cover,
                format: details.format,
                price: details.price,
                introduction: details.intro,
                publishTime: details.publishTime,
                category: details.category,
                isbn: details.isbn,
                publisher: details.publisher,
                totalWords: details.totalWords,
                star: details.newRating,
                ratingCount: details.ratingCount,
                AISummary: details.AISummary,
            };
        });
    }
    const notebooksList = await pool.awaitAll();
    return notebooksList;
}

async function handleVerifiedCookieSync(plugin: PluginDouban, cookies: string, bookCache: Map<string, Promise<WereadBookDetail>>) {
    const notebooksList = await buildTemporaryNotebookList(plugin, cookies, bookCache);
    await plugin.saveData("temporary_weread_notebooksList", notebooksList);
    await syncWereadNotes(plugin, cookies, true, bookCache);
}

const STORAGE_NAME = "menu-config";

export default class PluginDouban extends Plugin {

    isMobile: boolean;

    customTab: () => IModel;

    client = new sdk.Client(undefined, 'fetch');

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

    // 基于 cookie 字符串校验并返回状态
    private async verifyCookieStatus(cookies: string): Promise<{ userVid: string; success: boolean; loginDue: boolean }> {
        const result = checkWrVid(cookies);
        const userVid = result.userVid;
        if (!userVid) {
            return { userVid: "", success: false, loginDue: false };
        }
        const verifyResult = await verifyCookie(this, cookies, userVid);
        return { userVid, success: verifyResult.success, loginDue: verifyResult.loginDue };
    }

    // 二维码刷新后保存 cookie 并从本地重读
    private async saveAndReloadCookies(refreshedCookies: string): Promise<string> {
        const savedata = { cookies: refreshedCookies, isQRCode: true };
        await this.saveData("weread_cookie", savedata);
        const reloaded = await loadPluginData(this, "weread_cookie", DEFAULT_WEREAD_COOKIE);
        return reloaded.cookies;
    }

    async onLayoutReady() {
        const wereadSetting = await loadPluginData(this, "weread_settings", DEFAULT_WEREAD_SETTINGS);
        const autoSync = wereadSetting.autoSync;
        const savedCookie = await loadPluginData(this, "weread_cookie", DEFAULT_WEREAD_COOKIE);
        const cookies = savedCookie.cookies;

        if (autoSync) {
            if (!cookies || cookies.length === 0) {
                showMessage(this.i18n.showMessage22);
                return;
            }

            const initialStatus = await this.verifyCookieStatus(cookies);

            if (!initialStatus.userVid && !savedCookie.isQRCode) {
                showMessage(this.i18n.showMessage17);
                return;
            }

            if (initialStatus.userVid) {
                if (initialStatus.loginDue) {
                    if (!window.navigator.userAgent.includes("Electron") || typeof window.require !== "function") {
                        return;
                    }

                    showMessage(this.i18n.showMessage19)
                    try {
                        const refreshedCookies = await createWereadQRCodeDialog(this.i18n, false);
                        const reloadedCookies = await this.saveAndReloadCookies(refreshedCookies);
                        const reloadedStatus = await this.verifyCookieStatus(reloadedCookies);

                        if (reloadedStatus.success) {
                            showMessage(this.i18n.showMessage20);
                            const bookCache = new Map<string, Promise<WereadBookDetail>>();
                            await handleVerifiedCookieSync(this, reloadedCookies, bookCache);
                        } else {
                            showMessage(this.i18n.showMessage18);
                        }
                    } catch (error) {
                        showMessage(this.i18n.showMessage18);
                    }
                } else if (initialStatus.success) {
                    showMessage(this.i18n.showMessage21);
                    const bookCache = new Map<string, Promise<WereadBookDetail>>();
                    await handleVerifiedCookieSync(this, cookies, bookCache);
                }
            }
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
        svelteDialog({
            title: "",
            width: "auto",
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