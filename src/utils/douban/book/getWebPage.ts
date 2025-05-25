export async function fetchBookHtml(isbn: string) {
    const SEARCH_ENGINES = [
        "https://www.google.com",
        "https://www.bing.com",
        "https://yandex.com",
        "https://search.naver.com",
        "https://www.baidu.com",
        "https://www.sogou.com",
        "https://duckduckgo.com",
        "https://startpage.com",
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    try {
        const response = await fetch(`https://douban.com/isbn/${isbn}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
                Referer: "https://www.douban.com/",
                "Accept-Language": "zh-CN,zh;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                Connection: "keep-alive",
            },
            credentials: "omit",
            signal: controller.signal,
            mode: "no-cors",
            referrer: SEARCH_ENGINES[Math.floor(Math.random() * SEARCH_ENGINES.length)],
        });

        clearTimeout(timeoutId);
        return await response.text();
    } catch (error) {
        throw new Error(`通过ISBN号获取豆瓣书籍失败: ${error.message}`);
    }
}