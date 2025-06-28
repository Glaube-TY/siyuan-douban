import { svelteDialog } from "@/libs/dialog";
import wereadCookie from "@/components/common/wereadCookieDialog.svelte";
import allNotebooks from "@/components/common/allNotebooks.svelte";
import wereadNotesTemplate from "@/components/common/wereadNotesTemplate.svelte";

interface CheckResult {
    wrVid: string;
    userVid: string;
    checkMessage: string;
}

interface VerifyResult {
    success: boolean;
    message: string;
}

export const createWereadNotesTemplateDialog = (onConfirm: (newWereadTemplates: string) => void, initialTemplates = "") => {
    return () => {
        const dialog = svelteDialog({
            title: "填写微信读书笔记模板",
            constructor: (containerEl: HTMLElement) => {
                return new wereadNotesTemplate({
                    target: containerEl,
                    props: {
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

export const createBookShelfDialog = (books: any) => {
    return () => {
        svelteDialog({
            title: "微信读书书架列表",
            width: "620px",
            constructor: (containerEl: HTMLElement) => {
                return new allNotebooks({
                    target: containerEl,
                    props: {
                        books,
                    }
                });
            }
        });
    };
};

export const createNotebooksDialog = (books: any[]) => {
    return () => {
        svelteDialog({
            title: "微信读书笔记列表",
            width: "620px",
            constructor: (containerEl: HTMLElement) => {
                return new allNotebooks({
                    target: containerEl,
                    props: {
                        books,
                    }
                });
            }
        });
    };
};

export const createWereadDialog = (cookies: string, onConfirm: (newCookies: string) => void) => {
    return () => {
        const dialog = svelteDialog({
            title: "填写微信读书 Cookie",
            constructor: (containerEl: HTMLElement) => {
                return new wereadCookie({
                    target: containerEl,
                    props: {
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

    return {
        wrVid,
        userVid,
        checkMessage: wrVid
            ? '✅ Cookie 格式正确'
            : '❌ Cookie 格式错误'
    };
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
                message: `❌ 登录已过期，请重新获取Cookie (错误码: ${result.errCode})`
            };
        }

        const isValid = response.data.status === 200 && result.name;

        return {
            success: isValid,
            message: isValid
                ? `✅ 用户信息验证通过 用户名: ${result.name}`
                : `❌ 用户验证失败（状态码 ${response.data.status}）`
        };
    } catch (error) {
        return {
            success: false,
            message: `❌ 网络请求失败：${error.message}`
        };
    }
};
