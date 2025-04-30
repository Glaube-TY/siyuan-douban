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
    const span = Array.from(doc.querySelectorAll("span.pl")).find((el) => {
        const text = el.textContent?.trim();
        return text?.startsWith(label) || text === `${label}：`;
    });
    return span?.nextSibling?.textContent?.replace(/^[:：\s]+/, "")?.trim() || null;
};

export async function fetchDoubanBook(isbn: string): Promise<BookInfo> {
    const response = await fetch(`https://douban.com/isbn/${isbn}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
            'Referer': 'https://m.douban.com/'
        },
        credentials: 'omit'
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

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
        isbn,
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
        ratingCount: doc.querySelector(".rating_people span")?.textContent?.match(/\d+/)?.[0]
    };
}
