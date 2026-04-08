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

/**
 * 解析微信读书登录验证响应，统一判定逻辑
 * @param result 原始 API 返回结果
 * @param i18n 国际化文本映射
 * @returns 统一的验证结果
 */
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
            });

            await loginWindow.loadURL("https://weread.qq.com/#login");

            if (!idbtn) {
                // 静默模式：监听页面加载完成事件
                loginWindow.webContents.once('dom-ready', async () => {
                    try {
                        // 等待一小段时间确保登录完成
                        await new Promise(r => setTimeout(r, 2000));

                        const session = remote.session.defaultSession;
                        const cookieArray = await session.cookies.get({ url: 'https://weread.qq.com' });
                        const cookies = cookieArray
                            .map(cookie => `${cookie.name}=${cookie.value}`)
                            .join("; ");
                        
                        // 只判断是否拿到 cookie，不判断内容是否变化
                        // 由调用方用 checkWrVid + verifyCookie 做最终判定
                        if (!cookies || cookies.length === 0) {
                            await finishReject("Silent refresh failed: no cookies obtained");
                        } else {
                            await finishResolve(cookies, 'dom-ready');
                        }
                    } catch (error) {
                        await finishReject("Failed to get cookies in silent mode: " + error);
                    }
                });

                // 静默模式超时保护：如果15秒内未完成加载，则自动关闭
                silentTimeout = setTimeout(async () => {
                    try {
                        const session = remote.session.defaultSession;
                        const cookieArray = await session.cookies.get({ url: 'https://weread.qq.com' });
                        const cookies = cookieArray
                            .map(cookie => `${cookie.name}=${cookie.value}`)
                            .join("; ");
                        
                        // 只判断是否拿到 cookie，不判断内容是否变化
                        if (!cookies || cookies.length === 0) {
                            await finishReject("Silent refresh timeout: no cookies obtained");
                        } else {
                            await finishResolve(cookies, 'timeout');
                        }
                    } catch (error) {
                        await finishReject("Silent refresh timeout: " + error);
                    }
                }, 15000); // 15秒超时保护
            } else {
                // 显示扫码窗口
                loginWindow.on('close', async () => {
                    try {
                        const session = remote.session.defaultSession;
                        const cookieArray = await session.cookies.get({ url: 'https://weread.qq.com' });
                        const cookies = cookieArray
                            .map(cookie => `${cookie.name}=${cookie.value}`)
                            .join("; ");
                        
                        // close 事件中直接 resolve，不再调用 finishResolve 关闭窗口
                        if (finished) return;
                        finished = true;
                        
                        if (silentTimeout) {
                            clearTimeout(silentTimeout);
                            silentTimeout = null;
                        }
                        
                        resolve(cookies);
                    } catch (error) {
                        if (finished) return;
                        finished = true;
                        reject("Failed to get cookies: " + error);
                    }
                });
            }

        } catch (error) {
            // 确保在出错时也能清理窗口
            await finishReject("扫码登录失败: " + error);
        }
    });
}

export const createWereadNotesTemplateDialog = (i18n: any, onConfirm: (newWereadTemplates: string) => void, initialTemplates = "") => {
    return () => {
        const dialog = svelteDialog({
            title: i18n.setNotesTemplateTitle,
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
    _cookies: string,
    userVid: string
): Promise<VerifyResult> => {
    // 检查 Electron 环境
    if (!window.navigator.userAgent.includes("Electron") || typeof window.require !== "function") {
        return {
            success: false,
            loginDue: false,
            message: plugin.i18n.checkMessage5 + "Electron environment not available"
        };
    }

    let remote: any;
    try {
        remote = window.require("@electron/remote");
    } catch (e) {
        return {
            success: false,
            loginDue: false,
            message: plugin.i18n.checkMessage5 + "Remote module not available"
        };
    }

    const { BrowserWindow } = remote;
    if (!BrowserWindow) {
        return {
            success: false,
            loginDue: false,
            message: plugin.i18n.checkMessage5 + "BrowserWindow not available"
        };
    }

    return new Promise((resolve) => {
        let win: any = null;
        let timeoutId: any = null;

        // 15秒超时保护
        timeoutId = setTimeout(() => {
            if (win) {
                win.destroy();
                win = null;
            }
            resolve({
                success: false,
                loginDue: false,
                message: plugin.i18n.checkMessage5 + "Verification timeout"
            });
        }, 15000);

        try {
            // 创建隐藏窗口
            win = new BrowserWindow({
                width: 1,
                height: 1,
                show: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: false,
                    webSecurity: true
                }
            });

            // 页面加载完成后，在页面上下文执行 fetch 验证登录状态
            win.webContents.once('dom-ready', async () => {
                const fetchScript = `
                    (async () => {
                        try {
                            const resp = await fetch("https://weread.qq.com/web/user?userVid=${userVid}", {
                                credentials: "include"
                            });
                            const data = await resp.json();
                            return { success: true, data: data };
                        } catch (err) {
                            return { success: false, error: err.message };
                        }
                    })()
                `;

                try {
                    const fetchResult = await win.webContents.executeJavaScript(fetchScript);

                    // 清理
                    clearTimeout(timeoutId);
                    if (win) {
                        win.destroy();
                        win = null;
                    }

                    if (!fetchResult || !fetchResult.success) {
                        resolve({
                            success: false,
                            loginDue: false,
                            message: plugin.i18n.checkMessage5 + (fetchResult?.error || "Fetch failed")
                        });
                        return;
                    }

                    const result = fetchResult.data;

                    resolve(parseVerifyResponse(result, plugin.i18n));
                } catch (error: any) {
                    clearTimeout(timeoutId);
                    if (win) {
                        win.destroy();
                        win = null;
                    }

                    resolve({
                        success: false,
                        loginDue: false,
                        message: `${plugin.i18n.checkMessage5}${error?.message || error}`
                    });
                }
            });

            // 加载微信读书首页
            win.loadURL('https://weread.qq.com/').catch(() => {
                clearTimeout(timeoutId);
                if (win) {
                    win.destroy();
                    win = null;
                }

                resolve({
                    success: false,
                    loginDue: false,
                    message: plugin.i18n.checkMessage5 + "Failed to load page"
                });
            });

        } catch {
            clearTimeout(timeoutId);
            if (win) {
                win.destroy();
                win = null;
            }

            resolve({
                success: false,
                loginDue: false,
                message: plugin.i18n.checkMessage5 + "Failed to create window"
            });
        }
    });
};

/**
 * 通过 forwardProxy 验证 Cookie（专用于手动填 Cookie 场景）
 * 直接使用传入的 cookie 字符串进行校验，不依赖 Electron session
 */
export const verifyCookieByForwardProxy = async (
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

        const result = JSON.parse(response.data);

        return parseVerifyResponse(result, plugin.i18n);
    } catch (error: any) {
        return {
            success: false,
            loginDue: false,
            message: `${plugin.i18n.checkMessage5}${error?.message || error}`
        };
    }
};
