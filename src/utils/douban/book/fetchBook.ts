interface BookInfo {
    title: string;
    subtitle?: string;
    authors: string[];
    translators: string[];
    isbn: string;
    publisher?: string;
    publishDate?: string;
    pages?: string;
    price?: string;
    originalTitle?: string;
    binding?: string;
    series?: string;
    producer?: string;
    rating?: string;
    ratingCount?: string;
    cover?: string;
}

const extractInfo = (doc: Document, label: string): string | null => {
    // 定位所有候选元素并找到首个匹配标签的span
    const span = Array.from(doc.querySelectorAll("span.pl")).find((el) => {
        const text = el.textContent?.trim();
        return text?.startsWith(label) || text === `${label}：`;
    });

    // 处理兄弟节点文本：移除开头的冒号/空格并返回有效内容
    return span?.nextSibling?.textContent?.replace(/^[:：\s]+/, "")?.trim() || null;
};

export async function fetchDoubanBook(html: string): Promise<BookInfo> {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const title = doc.querySelector("h1")?.textContent?.trim();
        const isSubjectPage = html.includes('/subject/'); // 通过URL判断
        const hasBookInfo = !!doc.querySelector('#info'); // 通过信息区块判断
        if (!isSubjectPage || !hasBookInfo || !title) {
            throw new Error("无效的书籍页面，请确认访问的是豆瓣书籍详情页");
        }

        return {

            title: doc.querySelector("h1")?.textContent?.trim() || "未知书名",

            subtitle: document.evaluate(
                '//div[@id="info"]/span[text()="副标题:"]/following-sibling::text()[1]',
                doc,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue?.nodeValue?.trim() || extractInfo(doc, "副标题"),

            originalTitle: document.evaluate('//div[@id="info"]/span[contains(text(),"原作名")]/following-sibling::text()[1]', doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue?.nodeValue?.trim() || extractInfo(doc, "原作名"),

            authors: Array.from(doc.querySelectorAll("span.pl"))
                .filter((span) => span.textContent?.trim() === "作者")
                .flatMap((span) =>
                    Array.from(span.parentElement?.querySelectorAll("a") || [])
                        .map((a) => a.textContent?.replace(/【.*?】/g, "")?.trim())
                ),

            translators: Array.from(doc.querySelectorAll('span.pl'))
                .filter(span => span.textContent?.trim() === '译者')
                .flatMap(span =>
                    Array.from(span.parentElement?.querySelectorAll('a') || [])
                        .map(a => a.textContent?.trim())
                ).filter(Boolean) as string[],

            publisher: document.evaluate('//div[@id="info"]/span[text()="出版社:"]/following-sibling::a', doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue?.textContent?.trim() || extractInfo(doc, "出版社"),

            isbn: extractInfo(doc, "ISBN")?.replace(/[^0-9X]/g, "") || "",

            publishDate: extractInfo(doc, "出版年")?.replace(/年$/, ""),

            pages: extractInfo(doc, "页数")?.replace(/页$/, ""),

            price: extractInfo(doc, "定价")?.match(/[\d.]+/)?.[0],

            cover: doc.querySelector("#mainpic img")?.getAttribute("src")?.replace(/^http:/, "https:"),

            series: document.evaluate(
                '//div[@id="info"]/span[contains(text(),"丛书")]/following-sibling::a',
                doc,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue?.textContent?.trim() || extractInfo(doc, "丛书"),

            binding: document.evaluate(
                '//div[@id="info"]/span[text()="装帧:"]/following-sibling::text()[1]',
                doc,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue?.nodeValue?.trim() || extractInfo(doc, "装帧"),

            producer: document.evaluate('//div[@id="info"]/span[text()="出品方:"]/following-sibling::a', doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue?.textContent?.trim() || extractInfo(doc, "出品方"),

            rating: doc.querySelector(".rating_num")?.textContent?.trim(),

            ratingCount: doc.querySelector(".rating_people span")?.textContent?.match(/\d+/)?.[0] // 使用正则提取纯数字评分人数
        };
    } catch (error) {
        // 增强错误信息处理
        const errorMessage = error.message || error.toString();
        if (error.name === 'AbortError') {  // 超时异常分支
            throw new Error(`请求超时: ${errorMessage}`);
        }
        if (errorMessage.includes('Failed to fetch')) {  // 网络异常分支
            throw new Error(`豆瓣接口访问失败: 请检查网络连接或尝试使用代理 | ${errorMessage}`);
        }
        throw new Error(`获取数据失败: ${errorMessage}`); // 通用异常分支
    }
}
