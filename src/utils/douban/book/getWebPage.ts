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

    const DOUBAN_URLS = [
        `https://book.douban.com/isbn/${isbn}/`,
        `https://douban.com/isbn/${isbn}/`,
        `https://book.douban.com/subject_search?search_text=${isbn}`
    ];

    for (const url of DOUBAN_URLS) {
        try {
            const response = await forwardProxy(
                url,
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
        } catch (error) {
            if (error.message.includes('stopped after 3 redirects')) {
                continue;
            }
            throw new Error(`通过ISBN号获取豆瓣书籍失败: ${error.message}`);
        }
    }
    
    throw new Error(`通过ISBN号 ${isbn} 获取豆瓣书籍失败: 所有URL都尝试失败`);
}