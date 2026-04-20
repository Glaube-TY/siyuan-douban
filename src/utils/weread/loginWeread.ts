import { svelteDialog } from "@/libs/dialog";
import { showMessage } from "siyuan";
import wereadCookie from "@/components/common/wereadCookieDialog.svelte";
import allNotebooks from "@/components/common/allNotebooks.svelte";
import wereadNotesTemplate from "@/components/common/wereadNotesTemplate.svelte";

interface CheckResult {
    userVid: string;
}

interface VerifyResult {
    loginDue: boolean;
    success: boolean;
    message: string;
}

function parseVerifyResponse(result: any, i18n: Record<string, string>): VerifyResult {
    // errCode === -2012 表示登录过期，需要重新登录
    if (result.errCode === -2012) {
        return {
            success: false,
            loginDue: true,
            message: i18n.checkMessage2,
        };
    }

    // 有 name 字段表示登录有效
    const isValid = result.name;

    return {
        success: isValid,
        loginDue: false,
        message: isValid
            ? `${i18n.checkMessage3}${result.name}`
            : i18n.checkMessage4,
    };
}

export async function createWereadQRCodeDialog(i18n: any, idbtn: boolean): Promise<string> {

    return new Promise(async (resolve, reject) => {
        let remote: any = null;
        let loginWindow: any = null;
        let finished = false;
        let silentTimeout: ReturnType<typeof setTimeout> | null = null;
        let isCancelled = false;

        // 统一的完成处理函数，防止重复 resolve/reject 和重复关闭窗口
        const finishResolve = async (cookies: string, source: string) => {
            if (finished) return;
            finished = true;

            if (silentTimeout) {
                clearTimeout(silentTimeout);
                silentTimeout = null;
            }

            // 只在非 close 事件源且窗口仍存在时才关闭窗口
            // close 事件源表示窗口已经在关闭过程中，不需要再次关闭
            if (source !== 'close' && loginWindow && !loginWindow.isDestroyed()) {
                loginWindow.close();
            }

            resolve(cookies);
        };

        const finishReject = async (reason: string) => {
            if (finished) return;
            finished = true;

            if (silentTimeout) {
                clearTimeout(silentTimeout);
                silentTimeout = null;
            }

            if (loginWindow && !loginWindow.isDestroyed()) {
                loginWindow.close();
            }

            reject(reason);
        };

        const finishCancel = async () => {
            if (finished) return;
            finished = true;
            isCancelled = true;

            if (silentTimeout) {
                clearTimeout(silentTimeout);
                silentTimeout = null;
            }

            if (loginWindow && !loginWindow.isDestroyed()) {
                loginWindow.close();
            }

            reject("__CANCELLED__");
        };

        try {
            if (!window.navigator.userAgent.includes("Electron") || typeof window.require !== "function") {
                showMessage(i18n.showMessage23);
                return finishReject("Unsupported environment");
            }

            remote = window.require("@electron/remote");
            if (!remote) {
                showMessage(i18n.showMessage24);
                return finishReject("Remote module not available");
            }

            // 根据 idbtn 判断是否显示窗口
            loginWindow = new remote.BrowserWindow({
                width: 400,
                height: 400,
                show: idbtn, // 仅当 idbtn 为 true 时显示窗口
                autoHideMenuBar: true,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: true
                },
                // 添加以下配置避免影响主应用
                focusable: idbtn, // 静默模式下窗口不可获得焦点
                skipTaskbar: !idbtn, // 静默模式下不显示在任务栏
                alwaysOnTop: false, // 不置顶
                modal: false, // 非模态窗口
                // 手动扫码模式隐藏原生标题栏，使用自定义按钮作为唯一操作入口
                titleBarStyle: idbtn ? 'hidden' : 'default',
            });

            const isStillOnLoginPage = (url: string): boolean => {
                try {
                    const u = new URL(url);
                    return u.hostname === 'weread.qq.com' && u.hash === '#login';
                } catch {
                    return url.includes('#login');
                }
            };

            const readCookiesAndResolve = async (source: string) => {
                if (finished) return;
                try {
                    const session = remote.session.defaultSession;
                    const cookieArray = await session.cookies.get({ url: 'https://weread.qq.com' });
                    const cookies = cookieArray
                        .map(cookie => `${cookie.name}=${cookie.value}`)
                        .join("; ");

                    if (!cookies || cookies.length === 0) {
                        await finishReject(`No cookies obtained (${source})`);
                    } else {
                        await finishResolve(cookies, source);
                    }
                } catch (error) {
                    await finishReject(`Failed to get cookies (${source}): ${error}`);
                }
            };

            // 手动模式：注入底部操作条
            const injectManualActionBar = async () => {
                if (!loginWindow || loginWindow.isDestroyed()) return;
                try {
                    await loginWindow.webContents.executeJavaScript(`
                        (function() {
                            if (document.getElementById('weread-manual-action-bar')) return;
                            const bar = document.createElement('div');
                            bar.id = 'weread-manual-action-bar';
                            bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;height:60px;background:#fff;border-top:1px solid #ddd;display:flex;align-items:center;justify-content:center;gap:20px;z-index:99999;padding:0 20px;box-sizing:border-box;';
                            
                            const confirmBtn = document.createElement('button');
                            confirmBtn.textContent = '确定';
                            confirmBtn.style.cssText = 'padding:8px 24px;background:#07c160;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;';
                            confirmBtn.onclick = () => { window.__WEREAD_MANUAL_CONFIRM__ = true; };
                            
                            const cancelBtn = document.createElement('button');
                            cancelBtn.textContent = '取消';
                            cancelBtn.style.cssText = 'padding:8px 24px;background:#f2f2f2;color:#333;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:14px;';
                            cancelBtn.onclick = () => { window.__WEREAD_MANUAL_CANCEL__ = true; };
                            
                            bar.appendChild(confirmBtn);
                            bar.appendChild(cancelBtn);
                            document.body.appendChild(bar);
                            document.body.style.paddingBottom = '60px';
                        })();
                    `);
                } catch (e) {
                    // 注入失败不影响主流程
                }
            };

            // 手动模式：轮询检查用户点击状态
            const startManualModePolling = () => {
                const pollInterval = setInterval(async () => {
                    if (finished) {
                        clearInterval(pollInterval);
                        return;
                    }
                    try {
                        const result = await loginWindow.webContents.executeJavaScript(`
                            (function() {
                                if (window.__WEREAD_MANUAL_CONFIRM__) {
                                    window.__WEREAD_MANUAL_CONFIRM__ = false;
                                    return 'confirm';
                                }
                                if (window.__WEREAD_MANUAL_CANCEL__) {
                                    window.__WEREAD_MANUAL_CANCEL__ = false;
                                    return 'cancel';
                                }
                                return null;
                            })()
                        `);
                        if (result === 'confirm') {
                            clearInterval(pollInterval);
                            await readCookiesAndResolve('manual-confirm');
                        } else if (result === 'cancel') {
                            clearInterval(pollInterval);
                            await finishCancel();
                        }
                    } catch (e) {
                        // 轮询出错继续
                    }
                }, 300);
            };

            if (idbtn) {
                // 手动扫码模式：先 loadURL，再注入操作条，等待用户明确操作
                await loginWindow.loadURL("https://weread.qq.com/#login");
                loginWindow.webContents.on('dom-ready', injectManualActionBar);
                // 延迟注入确保页面加载完成
                setTimeout(injectManualActionBar, 1000);
                startManualModePolling();

                // 手动模式：窗口关闭按取消处理
                loginWindow.on('close', async () => {
                    if (finished) return;
                    await finishCancel();
                });
            } else {
                // 隐藏自动刷新模式：先注册监听，再 loadURL，确保不遗漏首次加载事件
                loginWindow.webContents.on('did-navigate', async (_event: any, url: string) => {
                    if (finished) return;
                    if (!isStillOnLoginPage(url)) {
                        await readCookiesAndResolve('did-navigate');
                    }
                });

                loginWindow.webContents.on('did-navigate-in-page', async (_event: any, url: string) => {
                    if (finished) return;
                    if (!isStillOnLoginPage(url)) {
                        await readCookiesAndResolve('did-navigate-in-page');
                    }
                });

                // loadURL 完成后，检查当前 URL 是否已不在登录页（兜底：处理初始加载即已登录的情况）
                loginWindow.webContents.once('did-finish-load', async () => {
                    if (finished) return;
                    try {
                        const currentURL = loginWindow.webContents.getURL();
                        if (!isStillOnLoginPage(currentURL)) {
                            await readCookiesAndResolve('did-finish-load');
                        }
                    } catch (e) {
                        // 获取 URL 失败时忽略，继续等待导航事件或超时
                    }
                });

                // 超时保护：如果页面始终停留在登录页，则判定刷新失败
                silentTimeout = setTimeout(async () => {
                    if (finished) return;
                    await finishReject("Login page timeout: session did not restore");
                }, 15000);

                // 监听注册完成后再加载页面，确保捕获所有导航事件
                await loginWindow.loadURL("https://weread.qq.com/#login");
            }

        } catch (error) {
            // 确保在出错时也能清理窗口
            await finishReject("扫码登录失败: " + error);
        }
    });
}

export const createWereadNotesTemplateDialog = (i18n: any, onConfirm: (newWereadTemplates: string) => void, initialTemplates = "", title: string) => {
    return () => {
        const dialog = svelteDialog({
            title: title,
            constructor: (containerEl: HTMLElement) => {
                return new wereadNotesTemplate({
                    target: containerEl,
                    props: {
                        i18n: i18n,
                        newWereadTemplates: initialTemplates,
                        close: () => dialog.close(),
                        confirm: (newWereadTemplates: string) => {
                            onConfirm(newWereadTemplates);
                            dialog.close();
                        }
                    }
                });
            }
        });
    };
};

export const createBookShelfDialog = (plugin: any, books: any) => {
    return () => {
        svelteDialog({
            title: plugin.i18n.bookShelfTitle,
            width: "620px",
            constructor: (containerEl: HTMLElement) => {
                return new allNotebooks({
                    target: containerEl,
                    props: {
                        plugin: plugin,
                        books,
                    }
                });
            }
        });
    };
};

export const createNotebooksDialog = (plugin: any, books: any[]) => {
    return () => {
        svelteDialog({
            title: plugin.i18n.bookNotesTitle,
            width: "620px",
            constructor: (containerEl: HTMLElement) => {
                return new allNotebooks({
                    target: containerEl,
                    props: {
                        plugin: plugin,
                        books,
                    }
                });
            }
        });
    };
};

export const createWereadDialog = (plugin: any, cookies: string, onConfirm: (newCookies: string) => void) => {
    return () => {
        const dialog = svelteDialog({
            title: plugin.i18n.fillCookie,
            constructor: (containerEl: HTMLElement) => {
                return new wereadCookie({
                    target: containerEl,
                    props: {
                        plugin: plugin,
                        cookies: cookies,
                        close: () => dialog.close(),
                        confirm: (newCookies: string) => {
                            onConfirm(newCookies);
                            dialog.close();
                        }
                    }
                });
            }
        });
    };
};

export const checkWrVid = (cookieStr: string): CheckResult => {
    const cookies = cookieStr.split("; ");
    const wrVid = cookies.find((c) => c.startsWith("wr_vid=")) || "";
    const userVid = wrVid ? wrVid.split("=")[1]?.trim() || "" : "";

    return { userVid };
};

export const verifyCookie = async (
    plugin: any,
    cookies: string,
    userVid: string
): Promise<VerifyResult> => {
    try {
        const response = await plugin.client.forwardProxy({
            url: `https://weread.qq.com/web/user?userVid=${userVid}`,
            method: "GET" as const,
            headers: [{
                Cookie: cookies,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }],
        });

        const result = JSON.parse(response.data.body);

        return parseVerifyResponse(result, plugin.i18n);
    } catch (error: any) {
        return {
            success: false,
            loginDue: false,
            message: `${plugin.i18n.checkMessage5}${error?.message || error}`
        };
    }
};
