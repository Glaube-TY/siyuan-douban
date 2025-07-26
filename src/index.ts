import { Plugin, IModel, showMessage, } from "siyuan";
import setPage from "./components/index.svelte";
import { svelteDialog } from "./libs/dialog";
import * as sdk from "@siyuan-community/siyuan-sdk";
import { syncWereadNotes } from "./utils/weread/syncWereadNotes";
import {
    createWereadQRCodeDialog,
    checkWrVid,
    verifyCookie,
} from "@/utils/weread/loginWeread";
import {
    getNotebooks,
    getBook,
} from "@/utils/weread/wereadInterface";

const STORAGE_NAME = "menu-config";

export default class PluginSample extends Plugin {

    customTab: () => IModel;

    client = new sdk.Client(undefined, 'fetch');

    async onload() {
        this.data[STORAGE_NAME] = { readonlyText: "Readonly" };

        this.i18n = { ...this.i18n, };

        await this.loadData(STORAGE_NAME);

        this.addIcons(`<symbol id="iconNotebook" viewBox="0 0 1024 1024"><path d="M784 260.266667h145.066667v208.853333h-145.066667zM784 522.026667h145.066667v208.853333h-145.066667zM784 784h145.066667V960h-145.066667zM929.066667 207.36V64h-145.066667v143.36h145.066667z" fill="#A25C11" p-id="18569"></path><path d="M133.546667 64c-21.12 0-38.613333 16.64-38.613334 36.906667v822.4c0 20.266667 17.28 36.906667 38.613334 36.906666h580.48V64H133.546667z m260.906666 523.52h-130.986666c-14.506667 0-26.453333-11.946667-26.453334-26.453333V168.32c0-14.506667 11.946667-26.453333 26.453334-26.453333h130.986666c14.506667 0 26.453333 11.946667 26.453334 26.453333V561.066667c0 14.72-11.946667 26.453333-26.453334 26.453333z" fill="#333333" p-id="18570"></path><path d="M290.133333 194.773333h77.866667v339.626667H290.133333z" fill="#A25C11" p-id="18571"></path></symbol>`);

        this.addTopBar({
            icon: "iconNotebook",
            title: "读书笔记",
            position: "right",
            callback: () => {
                this.showDialog();
            }
        });
    }

    async onLayoutReady() {
        const wereadSetting = await this.loadData("weread_settings");
        const autoSync = wereadSetting.autoSync;
        const savedCookie = await this.loadData("weread_cookie");
        const cookies = savedCookie.cookies;
        let userVid = "";

        if (autoSync) {
            if (savedCookie) {
                const result = checkWrVid(cookies);
                userVid = result.userVid;

                if (!userVid && !savedCookie.isQRCode) {
                    showMessage("Cookies 格式不正确，请重新输入！");
                    return
                }

                if (userVid) {
                    const verifyResult = await verifyCookie(
                        this,
                        cookies,
                        userVid,
                    );

                    if (verifyResult.loginDue) {
                        showMessage("登录已过期，正在重新登录...")
                        const autoCookies = await createWereadQRCodeDialog(false);
                        const savedata = {
                            cookies: autoCookies,
                            isQRCode: true,
                        };
                        this.saveData("weread_cookie", savedata);

                        const result = checkWrVid(autoCookies);
                        userVid = result.userVid;

                        if (userVid) {
                            const verifyResult = await verifyCookie(this, autoCookies, userVid);

                            if (verifyResult.success) {
                                showMessage("登录成功，正在同步笔记...");
                                await syncWereadNotes(this, autoCookies, true);
                            }
                        }
                    } else if (verifyResult.success) {
                        showMessage("正在同步微信读书笔记...");
                        const notebookdata = await getNotebooks(this, cookies);
                        const basicBooks = notebookdata.books;
                        const notebooksList = await Promise.all(
                            basicBooks.map(async (b: any) => {
                                const details = await getBook(this, cookies, b.bookId);
                                return {
                                    noteCount: b.noteCount,
                                    reviewCount: b.reviewCount,
                                    updatedTime: b.sort,
                                    bookID: details.bookId,
                                    title: details.title,
                                    author: details.author || "未知作者",
                                    cover: details.cover,
                                    format: details.format === "epub" ? "电子书" : "纸质书",
                                    price: details.price,
                                    introduction: details.intro,
                                    publishTime: details.publishTime,
                                    category: details.category || "未分类",
                                    isbn: details.isbn,
                                    publisher: details.publisher || "未知出版社",
                                    totalWords: details.totalWords,
                                    star: details.newRating,
                                    ratingCount: details.ratingCount,
                                    AISummary: details.AISummary,
                                };
                            }),
                        );

                        await this.saveData("temporary_weread_notebooksList", notebooksList);
                        await syncWereadNotes(this, cookies, true);
                    }
                }
            } else {
                showMessage("请先登录微信读书，或手动输入 cookies")
            }
        }
    }

    private showDialog() {
        svelteDialog({
            title: this.i18n.setTitle,
            width: "auto",
            constructor: (container: HTMLElement) => {
                return new setPage({
                    target: container,
                    props: {
                        app: this.app,
                        i18n: this.i18n,
                        plugin: this,
                    }
                });
            }
        });
    }
}
