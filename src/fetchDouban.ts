/**
 * 豆瓣图书信息获取模块
 * 
 * 核心功能：
 * - 通过ISBN号从豆瓣获取完整的图书元数据
 * - 实现HTML解析与数据清洗
 * - 提供反爬虫策略和安全重试机制
 * 
 * 主要包含：
 * 1. BookInfo 数据结构接口
 * 2. 基于DOM解析的信息提取工具函数
 * 3. 支持随机请求头和安全超时的网络请求实现
 * 
 * 关键技术：
 * - 使用XPath和CSS选择器混合解析方案
 * - 移动端UA模拟和请求来源随机化
 * - 兼容服务端渲染的DOM解析技术
 */

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

/**
 * 从HTML文档中提取指定标签后的关联信息
 * 
 * @param doc - 被解析的HTML文档对象，用于执行DOM查询操作
 * @param label - 需要匹配的标签文本（支持中英文冒号自动匹配）
 * @returns 提取到的信息内容（自动去除首部冒号和空格），未找到时返回null
 * 
 * 实现逻辑：
 * 1. 在文档中查找所有包含指定类名的span元素
 * 2. 定位第一个文本内容匹配目标标签的元素（支持中英文冒号格式）
 * 3. 获取相邻兄弟节点的文本内容并清理格式
 */
const extractInfo = (doc: Document, label: string): string | null => {
    // 定位所有候选元素并找到首个匹配标签的span
    const span = Array.from(doc.querySelectorAll("span.pl")).find((el) => {
        const text = el.textContent?.trim();
        return text?.startsWith(label) || text === `${label}：`;
    });

    // 处理兄弟节点文本：移除开头的冒号/空格并返回有效内容
    return span?.nextSibling?.textContent?.replace(/^[:：\s]+/, "")?.trim() || null;
};

/**
 * 预定义的搜索引擎URL集合，按类别分组
 * 
 * 包含国际通用引擎、中文市场常用引擎以及注重隐私保护的引擎，
 * 用于统一处理搜索功能时提供基础URL配置
 * 
 * 结构说明：
 * - 国际引擎: Google, Bing, Yandex, Naver
 * - 中文引擎: 百度，搜狗
 * - 隐私引擎: DuckDuckGo, Startpage
 */
const SEARCH_ENGINES = [
    // 国际引擎
    'https://www.google.com',
    'https://www.bing.com',
    'https://yandex.com',
    'https://search.naver.com',
    // 中文引擎
    'https://www.baidu.com',
    'https://www.sogou.com',
    // 隐私引擎
    'https://duckduckgo.com',
    'https://startpage.com'
];

/**
 * 通过豆瓣图书API获取书籍详细信息（需注意豆瓣反爬机制）
 * @param isbn - 国际标准书号，用于精准匹配图书
 * @returns Promise包装的图书信息对象，包含书名、作者、出版社等核心元数据
 */
export async function fetchDoubanBook(isbn: string): Promise<BookInfo> {
    // 创建中断控制器用于实现请求超时
    const controller = new AbortController();
    // 设置10秒超时定时器
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
        // 发起图书信息请求
        const response = await fetch(`https://douban.com/isbn/${isbn}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
                'Referer': 'https://www.douban.com/',
                'Accept-Language': 'zh-CN,zh;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive'
            },
            credentials: 'omit',  // 不携带cookie避免身份追踪
            signal: controller.signal,  // 绑定中断信号
            mode: 'no-cors',  // 绕过CORS限制
            referrer: SEARCH_ENGINES[Math.floor(Math.random() * SEARCH_ENGINES.length)] // 随机来源降低封禁风险
        });

        clearTimeout(timeoutId);  // 清除已触发的定时器

        // 处理非200状态码
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        // 解析HTML文档结构
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        return {
            // 核心信息提取区块
            title: doc.querySelector("h1")?.textContent?.trim() || "未知书名", // 主标题必填项
            // 使用XPath和备用方案获取副标题
            subtitle: document.evaluate(
                '//div[@id="info"]/span[text()="副标题:"]/following-sibling::text()[1]', // XPath定位副标题文本节点
                doc,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue?.nodeValue?.trim() || extractInfo(doc, "副标题"), // 备用CSS选择器方案

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
