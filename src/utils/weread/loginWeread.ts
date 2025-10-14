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

export async function createWereadQRCodeDialog(i18n: any, idbtn: boolean): Promise<string> {

    return new Promise(async (resolve, reject) => {
        let remote: any = null;
        let loginWindow: any = null;

        try {
            if (!window.navigator.userAgent.includes("Electron") || typeof window.require !== "function") {
                showMessage(i18n.showMessage23);
                return reject("Unsupported environment");
            }

            remote = window.require("@electron/remote");
            if (!remote) {
                showMessage(i18n.showMessage24);
                return reject("Remote module not available");
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

            // 页面加载完成监听器
            if (!idbtn) {
                // 静默模式：监听页面加载完成事件
                loginWindow.webContents.once('dom-ready', async () => {
                    try {
                        // 等待一小段时间确保登录完成
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        const session = remote.session.defaultSession;
                        const cookieArray = await session.cookies.get({ url: 'https://weread.qq.com' });
                        const cookies = cookieArray
                            .map(cookie => `${cookie.name}=${cookie.value}`)
                            .join("; ");
                        loginWindow.close(); // 关闭窗口
                        resolve(cookies);
                    } catch (error) {
                        reject("Failed to get cookies in silent mode");
                    }
                });
            }

            await loginWindow.loadURL("https://weread.qq.com/#login");

            if (!idbtn) {
                // 静默模式超时保护：如果10秒内未完成加载，则自动关闭
                setTimeout(async () => {
                    try {
                        const session = remote.session.defaultSession;
                        const cookieArray = await session.cookies.get({ url: 'https://weread.qq.com' });
                        const cookies = cookieArray
                            .map(cookie => `${cookie.name}=${cookie.value}`)
                            .join("; ");
                        loginWindow.close(); // 关闭窗口
                        resolve(cookies);
                    } catch (error) {
                        reject("Failed to get cookies in silent mode");
                    }
                }, 10000); // 10秒超时保护
            } else {
                // 显示扫码窗口
                loginWindow.on('close', async () => {
                    try {
                        const session = remote.session.defaultSession;
                        const cookieArray = await session.cookies.get({ url: 'https://weread.qq.com' });
                        const cookies = cookieArray
                            .map(cookie => `${cookie.name}=${cookie.value}`)
                            .join("; ");
                        resolve(cookies);
                    } catch (error) {
                        reject("Failed to get cookies");
                    }
                });
            }

        } catch (error) {
            // 确保在出错时也能清理窗口
            if (loginWindow && !loginWindow.isDestroyed()) {
                loginWindow.close();
                loginWindow.destroy();
            }
            reject("扫码登录失败: " + error);
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
    cookies: string,
    userVid: string
): Promise<VerifyResult> => {
    try {
        const response = await plugin.client.forwardProxy({
            url: `https://weread.qq.com/web/user?userVid=${userVid}`,
            method: "GET",
            headers: [{
                "User-Agent": "Mozilla/5.0 (...Chrome/73.0.3683.103...)",
                Cookie: cookies,
            }],
            contentType: "application/json",
            responseEncoding: "text",
        });

        const result = JSON.parse(response.data.body);

        if (result.errCode === -2012) {
            return {
                success: false,
                loginDue: true,
                message: plugin.i18n.checkMessage2,
            };
        }

        const isValid = response.data.status === 200 && result.name;

        return {
            success: isValid,
            loginDue: false,
            message: isValid
                ? `${plugin.i18n.checkMessage3}${result.name}`
                : plugin.i18n.checkMessage4,
        };
    } catch (error) {
        return {
            success: false,
            loginDue: false,
            message: `${plugin.i18n.checkMessage5}${error.message}`
        };
    }
};
