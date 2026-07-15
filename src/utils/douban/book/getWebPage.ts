import { forwardProxyStrict } from "@/api";

export const DOUBAN_DESKTOP_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export function getDoubanHeaders(referer: string = "https://book.douban.com/") {
    return [
        { "User-Agent": DOUBAN_DESKTOP_USER_AGENT },
        { Referer: referer },
        { Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8" },
        { "Accept-Language": "zh-CN,zh;q=0.9" },
    ];
}

export async function fetchDoubanText(url: string, referer: string = "https://book.douban.com/"): Promise<string> {
    const response = await forwardProxyStrict(
        url,
        "GET",
        "",
        getDoubanHeaders(referer),
        15000,
        "text/html",
        "text",
        "text",
    );

    if (response.status < 200 || response.status >= 400 || !response.body) {
        throw new Error(`豆瓣请求失败（HTTP ${response.status || "未知"}）`);
    }
    return response.body;
}

export async function fetchBookHtml(isbn: string) {
    const DOUBAN_URLS = [
        `https://book.douban.com/isbn/${isbn}/`,
        `https://douban.com/isbn/${isbn}/`,
        `https://book.douban.com/subject_search?search_text=${isbn}`
    ];
    let lastError = "未知错误";

    for (const url of DOUBAN_URLS) {
        try {
            const html = await fetchDoubanText(url);
            const doc = new DOMParser().parseFromString(html, "text/html");
            const canonicalUrl = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href
                || doc.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content
                || "";
            if (doc.querySelector("#info") && /\/subject\/\d+/.test(canonicalUrl || html)) {
                return html;
            }
            lastError = "返回内容不是豆瓣书籍详情页";
        } catch (error: any) {
            lastError = error?.message || String(error);
        }
    }

    throw new Error(`通过 ISBN ${isbn} 获取豆瓣书籍失败：${lastError}`);
}

export async function fetchDoubanSubjectHtml(subjectId: string): Promise<string> {
    if (!/^\d+$/.test(subjectId)) {
        throw new Error("无效的豆瓣书籍 ID");
    }
    return fetchDoubanText(`https://book.douban.com/subject/${subjectId}/`);
}
