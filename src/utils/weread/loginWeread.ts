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

            // 监听页面导航：当 URL 离开登录页时读取 cookie
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

            await loginWindow.loadURL("https://weread.qq.com/#login");

            // 超时保护：如果页面始终停留在登录页，则判定刷新失败
            silentTimeout = setTimeout(async () => {
                if (finished) return;
                await finishReject("Login page timeout: session did not restore");
            }, 15000);

            if (idbtn) {
                // 手动扫码模式：用户关闭窗口时，如果仍在登录页则按取消处理
                loginWindow.on('close', async () => {
                    if (finished) return;
                    // 已通过导航事件成功拿到 cookie 的情况不会走到这里
                    // 走到这里说明用户关闭窗口时仍在登录页
                    await finishReject("User closed login window without completing login");
                });
            }

        } catch (error) {
            // 确保在出错时也能清理窗口
            await finishReject("扫码登录失败: " + error);
        }
    });
}

const DEFAULT_WEREAD_NOTES_TEMPLATE = `{{#chapters}}

{{#chapterTitle}}
## {{chapterTitle1}}
### {{chapterTitle2}}
#### {{chapterTitle3}}
##### {{chapterTitle4}}
{{/chapterTitle}}

{{#chapterComments}}
### 章节思考
> 💬 {{chapterComments}}
- 🕐 {{createTime7}}
{{/chapterComments}}

{{#notes}}
{{#highlightText}}
- {{highlightText}}
{{/highlightText}}
{{#highlightCreateTime7}}
  - 标注时间：{{highlightCreateTime7}}
{{/highlightCreateTime7}}
{{#comments}}
  - 💬 {{content}}
  {{#commentCreateTime7}}
    - 评论时间：{{commentCreateTime7}}
  {{/commentCreateTime7}}
{{/comments}}
{{#createTime7}}
- 主时间：{{createTime7}}
{{/createTime7}}
{{/notes}}

{{/chapters}}`;

export const createWereadNotesTemplateDialog = (i18n: any, onConfirm: (newWereadTemplates: string) => void, initialTemplates = "") => {
    return () => {
        const dialog = svelteDialog({
            title: i18n.setNotesTemplateTitle,
            constructor: (containerEl: HTMLElement) => {
                return new wereadNotesTemplate({
                    target: containerEl,
                    props: {
                        i18n: i18n,
                        newWereadTemplates: initialTemplates || DEFAULT_WEREAD_NOTES_TEMPLATE,
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
