import { showMessage } from "siyuan";

function getHeaders(cookies: string) {
    return {
        'User-Agent': 'Mozilla/5.0 (...Chrome/73.0.3683.103...)',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        Cookie: cookies
    };
}

function checkResponse(response: any) {
    if (response.data.status !== 200) {
        showMessage("⚠️ 微信读书 Cookie 失效，请前往插件设置中更新", 5000);
        throw new Error('Request failed with status: ' + response.data.status);
    }
    return JSON.parse(response.data.body);
}

// 获取所有有笔记的书籍
export async function getNotebooks(plugin: any, cookies: string) {
    const response = await plugin.client.forwardProxy({
        url: "https://weread.qq.com/api/user/notebook",
        method: "GET" as const,
        headers: [{ ...getHeaders(cookies) }],
    });
    return checkResponse(response);
}

// 获取书籍详细信息
export async function getBook(plugin: any, cookies: string, bookID: string) {
    const response = await plugin.client.forwardProxy({
        url: `https://weread.qq.com/web/book/info?bookId=${bookID}`,
        method: "GET" as const,
        headers: [{ ...getHeaders(cookies) }],
    });
    return checkResponse(response);
}

// 获取书架图书信息
export async function getBookShelf(plugin: any, cookies: string, userVid: string) {
    const response = await plugin.client.forwardProxy({
        url: `https://weread.qq.com/web/shelf/sync?userVid=${userVid}&synckey=0&lectureSynckey=0`,
        method: "GET" as const,
        headers: [{ ...getHeaders(cookies) }],
    });
    return checkResponse(response);
}

// 获取书籍划线
export async function getBookHighlights(plugin: any, cookies: string, bookId: string) {
    const response = await plugin.client.forwardProxy({
        url: `https://weread.qq.com/web/book/bookmarklist?bookId=${bookId}`,
        method: "GET" as const,
        headers: [{ ...getHeaders(cookies) }],
    });
    return checkResponse(response);
}

// 获取书籍评论
export async function getBookComments(plugin: any, cookies: string, bookId: string) {
    const response = await plugin.client.forwardProxy({
        url: `https://weread.qq.com/web/review/list?bookId=${bookId}&listType=11&mine=1&synckey=0&listMode=0`,
        method: "GET" as const,
        headers: [{ ...getHeaders(cookies) }],
    });
    return checkResponse(response);
}