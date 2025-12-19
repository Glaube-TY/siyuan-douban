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
    description?: string;
    authorBio?: string;
}

const extractInfo = (doc: Document, label: string): string | null => {
    const span = Array.from(doc.querySelectorAll("span.pl")).find((el) => {
        const text = el.textContent?.trim();
        return text?.startsWith(label) || text === `${label}：`;
    });
    return span?.nextSibling?.textContent?.replace(/^[:：\s]+/, "")?.trim() || null;
};

export async function fetchDoubanBook(html: string): Promise<BookInfo> {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const title = doc.querySelector("h1")?.textContent?.trim();
        const isSubjectPage = html.includes('/subject/');
        const hasBookInfo = !!doc.querySelector('#info');
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

            ratingCount: doc.querySelector(".rating_people span")?.textContent?.match(/\d+/)?.[0],

            description: (() => {
                // 优先从展开的内容简介中获取完整内容
                const fullContent = doc.querySelector('#link-report .all.hidden .intro');
                if (fullContent) {
                    return Array.from(fullContent.querySelectorAll('p'))
                        .map(p => p.textContent?.trim())
                        .filter(text => text && !text.startsWith('【') && !text.includes('(展开全部)'))
                        .join('\n\n');
                }
                
                // 如果没有展开内容，尝试获取简短版本
                const shortContent = doc.querySelector('#link-report .short .intro');
                if (shortContent) {
                    return Array.from(shortContent.querySelectorAll('p'))
                        .map(p => p.textContent?.trim())
                        .filter(text => text && !text.startsWith('【') && !text.includes('(展开全部)'))
                        .join('\n\n');
                }
                
                // 最后尝试从meta标签获取
                const metaDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute('content');
                if (metaDesc) {
                    return metaDesc.trim();
                }
                
                return null;
            })(),

            authorBio: (() => {
                // 精准定位：查找包含"作者简介"文本的h2元素
                const allH2 = doc.querySelectorAll('h2');
                let authorH2: Element | null = null;
                
                for (const h2 of allH2) {
                    const span = h2.querySelector('span');
                    if (span && (span as HTMLElement).textContent?.includes('作者简介')) {
                        authorH2 = h2;
                        break;
                    }
                }
                
                if (authorH2) {
                    // 获取h2后面的兄弟元素中的.intro内容
                    let nextElement = authorH2.nextElementSibling as Element | null;
                    while (nextElement) {
                        const authorIntro = nextElement.querySelector('.intro');
                        if (authorIntro) {
                            return Array.from(authorIntro.querySelectorAll('p'))
                                .map(p => (p as HTMLElement).textContent?.trim())
                                .filter(text => text && text.length > 0)
                                .join('\n\n');
                        }
                        // 如果当前元素没有.intro，继续查找下一个兄弟元素
                        nextElement = nextElement.nextElementSibling as Element | null;
                    }
                }
                
                return null;
            })()
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
