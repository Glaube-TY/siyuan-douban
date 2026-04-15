import { showMessage } from "siyuan";
import type {
    WereadPluginLike,
    WereadBookDetail,
    WereadBookShelfResponse,
    WereadHighlightsResponse,
    WereadCommentsResponse,
    WereadBestHighlightsResponse,
    WereadChapterInfosBookRecord
} from "./types";

/** ForwardProxy 原始响应结构（思源代理层包装） */
interface ForwardProxyRawResponse {
    code: number;
    msg: string;
    data: {
        status: number;
        body: string;
        contentType?: string;
    };
}

function getHeaders(cookies: string) {
    return {
        'User-Agent': 'Mozilla/5.0 (...Chrome/73.0.3683.103...)',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        Cookie: cookies
    };
}

function parseForwardProxyJsonBody<T>(response: unknown): T {
    const proxyResponse = response as ForwardProxyRawResponse;

    // 检查思源代理层状态码
    if (proxyResponse.code !== 0) {
        throw new Error(`ForwardProxy failed: code=${proxyResponse.code}, msg=${proxyResponse.msg || 'unknown'}`);
    }

    // 检查 HTTP 响应状态
    if (!proxyResponse.data || proxyResponse.data.status !== 200) {
        showMessage("⚠️ 微信读书 Cookie 失效，请前往插件设置中更新", 5000);
        throw new Error(`HTTP request failed with status: ${proxyResponse.data?.status}`);
    }

    const body = proxyResponse.data.body;

    // 检查 body 是否为空
    if (!body || body === '') {
        throw new Error('Response body is empty');
    }

    // 检查 contentType 是否为 JSON（如果存在）
    const contentType = proxyResponse.data.contentType || '';
    const isJsonContent = contentType.includes('application/json') || contentType.includes('text/plain');

    if (!isJsonContent && contentType !== '') {
        console.warn(`[weread] Unexpected content type: ${contentType}`);
    }

    // 解析 JSON body
    try {
        const parsed = JSON.parse(body);
        return parsed as T;
    } catch (e) {
        throw new Error(`Failed to parse JSON body: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
}



interface NotebooksResponse {
    synckey?: number;
    totalBookCount?: number;
    books: Array<{
        bookId: string;
        noteCount: number;
        reviewCount: number;
        sort: number;
        style?: number;
        reviewId?: string;
        book?: {
            bookId: string;
            title: string;
            author: string;
            cover: string;
            format: string;
            price: number;
            intro: string;
            publishTime: string;
            category: string;
            isbn: string;
            publisher: string;
            totalWords: number;
            newRating: number;
            ratingCount: number;
            AISummary: string;
        };
    }>;
}

// 获取所有有笔记的书籍
export async function getNotebooks(plugin: WereadPluginLike, cookies: string): Promise<NotebooksResponse> {
    const response = await plugin.client.forwardProxy({
        url: "https://weread.qq.com/api/user/notebook",
        method: "GET" as const,
        headers: [{ ...getHeaders(cookies) }],
    });
    return parseForwardProxyJsonBody<NotebooksResponse>(response);
}

// 获取书籍详细信息
export async function getBook(plugin: WereadPluginLike, cookies: string, bookID: string): Promise<WereadBookDetail> {
    const response = await plugin.client.forwardProxy({
        url: `https://weread.qq.com/web/book/info?bookId=${bookID}`,
        method: "GET" as const,
        headers: [{ ...getHeaders(cookies) }],
    });
    return parseForwardProxyJsonBody<WereadBookDetail>(response);
}

// 获取书架图书信息
export async function getBookShelf(plugin: WereadPluginLike, cookies: string, userVid: string): Promise<WereadBookShelfResponse> {
    const response = await plugin.client.forwardProxy({
        url: `https://weread.qq.com/web/shelf/sync?userVid=${userVid}&synckey=0&lectureSynckey=0`,
        method: "GET" as const,
        headers: [{ ...getHeaders(cookies) }],
    });
    return parseForwardProxyJsonBody<WereadBookShelfResponse>(response);
}

// 获取书籍划线
export async function getBookHighlights(plugin: WereadPluginLike, cookies: string, bookId: string): Promise<WereadHighlightsResponse> {
    const response = await plugin.client.forwardProxy({
        url: `https://weread.qq.com/web/book/bookmarklist?bookId=${bookId}`,
        method: "GET" as const,
        headers: [{ ...getHeaders(cookies) }],
    });
    return parseForwardProxyJsonBody<WereadHighlightsResponse>(response);
}

// 获取书籍评论
export async function getBookComments(plugin: WereadPluginLike, cookies: string, bookId: string): Promise<WereadCommentsResponse> {
    const response = await plugin.client.forwardProxy({
        url: `https://weread.qq.com/web/review/list?bookId=${bookId}&listType=11&mine=1&synckey=0&listMode=0`,
        method: "GET" as const,
        headers: [{ ...getHeaders(cookies) }],
    });
    return parseForwardProxyJsonBody<WereadCommentsResponse>(response);
}

// 获取书籍热门划线
export async function getBookBestHighlights(plugin: WereadPluginLike, cookies: string, bookId: string): Promise<WereadBestHighlightsResponse> {
    const response = await plugin.client.forwardProxy({
        url: `https://weread.qq.com/web/book/bestbookmarks?bookId=${bookId}`,
        method: "GET" as const,
        headers: [{ ...getHeaders(cookies) }],
    });
    return parseForwardProxyJsonBody<WereadBestHighlightsResponse>(response);
}

// 获取书籍章节信息 - 使用 Electron 隐藏窗口在页面上下文中执行 fetch
export async function getBookChapterInfos(_plugin: WereadPluginLike, cookies: string, bookId: string): Promise<WereadChapterInfosBookRecord | null> {
    // 检查 Electron 环境
    if (typeof window.require !== "function") {
        console.error(`[weread/chapterInfos/electron] Electron 环境不可用`);
        return null;
    }

    let remote: any;
    try {
        remote = window.require('@electron/remote');
    } catch (e) {
        console.error(`[weread/chapterInfos/electron] @electron/remote 模块不可用:`, e);
        return null;
    }

    const { BrowserWindow } = remote;
    if (!BrowserWindow) {
        console.error(`[weread/chapterInfos/electron] BrowserWindow 不可用`);
        return null;
    }

    return new Promise((resolve) => {
        let win: any = null;
        let timeoutId: any = null;

        // 15秒超时保护
        timeoutId = setTimeout(() => {
            console.error(`[weread/chapterInfos/electron] 超时 bookId=${bookId}`);
            if (win) {
                win.destroy();
                win = null;
            }
            resolve(null);
        }, 15000);

        try {
            // 使用一次性隔离 partition，避免 cookie 污染默认 session
            const partition = `weread-chapter-${Date.now()}-${Math.random().toString(36).slice(2)}`;

            // 创建隐藏窗口
            win = new BrowserWindow({
                width: 1,
                height: 1,
                show: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: false,
                    webSecurity: true,
                    partition
                }
            });

            // 设置 Cookie
            const cookieUrl = 'https://weread.qq.com';
            const cookieParts = cookies.split(';').map(c => c.trim()).filter(c => c);
            cookieParts.forEach(async (cookieStr) => {
                const [nameValue] = cookieStr.split(';');
                const [name, value] = nameValue.split('=').map(s => s.trim());
                if (name && value) {
                    try {
                        await win.webContents.session.cookies.set({
                            url: cookieUrl,
                            name: name,
                            value: value
                        });
                    } catch (e) {
                        // 忽略单个 cookie 设置失败
                    }
                }
            });

            // 加载微信读书首页
            win.loadURL('https://weread.qq.com/').then(() => {
                // 在页面上下文中执行 fetch
                const fetchScript = `
                    (async () => {
                        try {
                            const resp = await fetch('https://weread.qq.com/web/book/chapterInfos', {
                                method: 'POST',
                                credentials: 'include',
                                headers: {
                                    'content-type': 'application/json;charset=UTF-8',
                                    'accept': 'application/json, text/plain, */*'
                                },
                                body: JSON.stringify({ bookIds: ['${bookId}'] })
                            });
                            const data = await resp.json();
                            return { success: true, data: data };
                        } catch (err) {
                            return { success: false, error: err.message };
                        }
                    })()
                `;

                win.webContents.executeJavaScript(fetchScript).then((result: any) => {
                    // 清理
                    clearTimeout(timeoutId);
                    if (win) {
                        win.destroy();
                        win = null;
                    }

                    if (!result || !result.success) {
                        console.error(`[weread/chapterInfos/electron] fetch 失败 bookId=${bookId}, error=${result?.error}`);
                        resolve(null);
                        return;
                    }

                    const data = result.data;
                    resolve(data?.data?.[0] || null);
                }).catch((err: any) => {
                    clearTimeout(timeoutId);
                    if (win) {
                        win.destroy();
                        win = null;
                    }
                    console.error(`[weread/chapterInfos/electron] executeJavaScript 失败 bookId=${bookId}:`, err);
                    resolve(null);
                });
            }).catch((err: any) => {
                clearTimeout(timeoutId);
                if (win) {
                    win.destroy();
                    win = null;
                }
                console.error(`[weread/chapterInfos/electron] 页面加载失败 bookId=${bookId}:`, err);
                resolve(null);
            });
        } catch (err: any) {
            clearTimeout(timeoutId);
            if (win) {
                win.destroy();
                win = null;
            }
            console.error(`[weread/chapterInfos/electron] 创建窗口失败 bookId=${bookId}:`, err);
            resolve(null);
        }
    });
}