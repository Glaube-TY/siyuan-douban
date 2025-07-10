import { forwardProxy } from "@/api";

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

    try {
        const response = await forwardProxy(
            `https://douban.com/isbn/${isbn}`,
            "GET",
            {},
            [
                { name: "User-Agent", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0" },
                { name: "Referer", value: "https://www.douban.com/" },
                { name: "Accept-Language", value: "zh-CN,zh;q=0.9" },
                { name: "Accept-Encoding", value: "gzip, deflate, br" },
                { name: "Connection", value: "keep-alive" },
                { name: "Referer", value: SEARCH_ENGINES[Math.floor(Math.random() * SEARCH_ENGINES.length)] }
            ],
            10000,
            "text/html"
        );

        if (response?.body) {
            return response.body;
        }
        throw new Error("请求失败");
    } catch (error) {
        throw new Error(`通过ISBN号获取豆瓣书籍失败: ${error.message}`);
    }
}