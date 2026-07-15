import { fetchDoubanText } from "./getWebPage";

export interface DoubanSearchCandidate {
    id: string;
    title: string;
    author?: string;
    year?: string;
    cover?: string;
    url: string;
}

interface DoubanSuggestItem {
    id?: string;
    title?: string;
    author_name?: string;
    year?: string;
    pic?: string;
    url?: string;
    type?: "a" | "b" | string;
}

function uniqueCandidates(items: DoubanSearchCandidate[]): DoubanSearchCandidate[] {
    const seen = new Set<string>();
    return items.filter((item) => {
        if (!item.id || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
    });
}

function parseAuthorWorks(html: string): DoubanSearchCandidate[] {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const candidates: DoubanSearchCandidate[] = [];

    for (const item of Array.from(doc.querySelectorAll(".subject-item"))) {
        const link = item.querySelector<HTMLAnchorElement>("h2 a[href*='/subject/']");
        const id = link?.href.match(/\/subject\/(\d+)/)?.[1] || "";
        if (!link || !id) continue;

        const pubText = item.querySelector(".pub")?.textContent?.trim() || "";
        const image = item.querySelector<HTMLImageElement>("img");
        candidates.push({
            id,
            title: link.textContent?.replace(/\s+/g, " ").trim() || "未知书名",
            author: pubText.split("/")[0]?.trim() || "",
            year: pubText.match(/(?:19|20)\d{2}/)?.[0] || "",
            cover: image?.getAttribute("src")?.replace(/^http:/, "https:") || "",
            url: `https://book.douban.com/subject/${id}/`,
        });
    }

    for (const item of Array.from(doc.querySelectorAll(".grid_view li"))) {
        const link = item.querySelector<HTMLAnchorElement>("h6 a[href*='/subject/']")
            || item.querySelector<HTMLAnchorElement>("a[href*='/subject/']");
        const id = link?.href.match(/\/subject\/(\d+)/)?.[1] || "";
        if (!link || !id) continue;

        const image = item.querySelector<HTMLImageElement>("img");
        const infoText = item.querySelector("dd > div:not(.star)")?.textContent?.replace(/\s+/g, " ").trim() || "";
        candidates.push({
            id,
            title: link.textContent?.replace(/\s+/g, " ").trim() || image?.alt || "未知书名",
            author: infoText.split("/")[0]?.trim() || "",
            year: item.querySelector("h6 span")?.textContent?.match(/(?:19|20)\d{2}/)?.[0] || "",
            cover: image?.getAttribute("src")?.replace(/^http:/, "https:") || "",
            url: `https://book.douban.com/subject/${id}/`,
        });
    }

    return uniqueCandidates(candidates);
}

async function fetchAuthorWorks(authorId: string): Promise<DoubanSearchCandidate[]> {
    if (!/^\d+$/.test(authorId)) return [];
    const url = `https://book.douban.com/author/${authorId}/books?sortby=collect&format=pic`;
    const html = await fetchDoubanText(url, `https://book.douban.com/author/${authorId}/`);
    return parseAuthorWorks(html).slice(0, 12);
}

async function fetchSuggestions(keyword: string): Promise<DoubanSuggestItem[]> {
    const url = `https://book.douban.com/j/subject_suggest?q=${encodeURIComponent(keyword)}`;
    const body = await fetchDoubanText(url);
    try {
        const parsed = JSON.parse(body);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        throw new Error("豆瓣候选结果格式异常");
    }
}

export async function searchDoubanSubjects(keyword: string): Promise<DoubanSearchCandidate[]> {
    const normalized = String(keyword || "").trim();
    if (!normalized) return [];

    const queries = [normalized];
    const terms = normalized.split(/\s+/).filter((term) => term.length >= 2);
    if (terms.length > 1) queries.push(...terms);

    const suggestions: DoubanSuggestItem[] = [];
    for (const query of Array.from(new Set(queries)).slice(0, 3)) {
        const items = await fetchSuggestions(query);
        suggestions.push(...items);
        if (items.some((item) => item.type === "b")) break;
    }

    const directBooks: DoubanSearchCandidate[] = suggestions
        .filter((item) => item.type === "b" && item.id)
        .map((item) => ({
            id: String(item.id),
            title: item.title?.trim() || "未知书名",
            author: item.author_name?.trim() || "",
            year: item.year || "",
            cover: item.pic?.replace(/^http:/, "https:") || "",
            url: item.url || `https://book.douban.com/subject/${item.id}/`,
        }));

    const authorIds = Array.from(new Set(
        suggestions.filter((item) => item.type === "a" && item.id).map((item) => String(item.id)),
    )).slice(0, 2);

    const authorBooks = (await Promise.all(authorIds.map((id) => fetchAuthorWorks(id).catch(() => [])))).flat();
    return uniqueCandidates([...directBooks, ...authorBooks]).slice(0, 16);
}
