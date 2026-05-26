import { getAttributeView, sql } from "@/api";

function getTextValue(v: any): string {
    if (!v) return "";
    if (v.text?.content) return String(v.text.content).trim();
    if (v.block?.content) return String(v.block.content).trim();
    return "";
}

function getNumberValue(v: any): string {
    if (!v) return "";
    if (v.number?.formattedContent) return String(v.number.formattedContent).trim();
    if (v.number?.content !== undefined && v.number?.content !== null) return String(v.number.content).trim();
    return "";
}

function getDateValue(v: any): string {
    if (!v) return "";
    const raw = v.date?.content;
    if (!raw) return "";
    try {
        const d = new Date(raw);
        if (isNaN(d.getTime())) return "";
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    } catch {
        return "";
    }
}

function getAssetValue(v: any): string {
    if (!v) return "";
    const assets = v.mAsset;
    if (Array.isArray(assets) && assets.length > 0) {
        return assets[0]?.content || "";
    }
    return "";
}

function getSelectValue(v: any): string {
    if (!v) return "";
    const selects = v.mSelect;
    if (Array.isArray(selects) && selects.length > 0) {
        return selects.map((s: any) => s.content).filter(Boolean).join("、");
    }
    return "";
}

function getDocCandidateID(v: any): string {
    return String(v?.block?.id ?? v?.blockID ?? "").trim();
}

async function loadValidDocIDs(ids: string[]): Promise<Set<string>> {
    const uniqueIDs = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIDs.length === 0) return new Set();

    try {
        const escapedIDs = uniqueIDs.map((id) => `"${id.replace(/"/g, '""')}"`).join(",");
        const blocks = await sql(`SELECT id, type FROM blocks WHERE id IN (${escapedIDs})`);
        return new Set(
            (blocks || [])
                .filter((block: any) => block?.type === "d")
                .map((block: any) => block.id)
                .filter(Boolean)
        );
    } catch {
        return new Set();
    }
}

export async function loadLocalBookShelfBooks(avID: string) {
    const db = await getAttributeView(avID);
    const keyValues = db?.av?.keyValues || [];

    const findKey = (name: string) => keyValues.find((kv: any) => kv.key?.name === name);

    const titleKey = findKey("书名");
    const coverKey = findKey("封面");
    const authorKey = findKey("作者");
    const publisherKey = findKey("出版社");
    const publishYearKey = findKey("出版年");
    const isbnKey = findKey("ISBN");
    const priceKey = findKey("定价");
    const pagesKey = findKey("页数");
    const doubanStarKey = findKey("豆瓣评分");
    const ratingCountKey = findKey("评分人数");
    const categoryKey = findKey("书籍分类");
    const readingStatusKey = findKey("阅读状态");

    const titleValues = titleKey?.values || [];

    const rowMap = new Map<string, any>();

    const docCandidateIDs: string[] = [];

    for (const tv of titleValues) {
        const blockID = tv.blockID || "";
        if (!blockID) continue;
        const title = getTextValue(tv);
        if (!title) continue;
        const docCandidateID = getDocCandidateID(tv);
        if (docCandidateID) docCandidateIDs.push(docCandidateID);

        rowMap.set(blockID, {
            blockID,
            docCandidateID,
            title,
            cover: "",
            author: "",
            publisher: "",
            publishTime: "",
            isbn: "",
            price: "",
            pages: "",
            star: "",
            ratingCount: "",
            category: "",
            readingStatus: "",
        });
    }

    function fillColumn(columnKey: any, getter: (v: any) => string) {
        if (!columnKey) return;
        for (const cv of columnKey.values || []) {
            const blockID = cv.blockID || "";
            if (!rowMap.has(blockID)) continue;
            const value = getter(cv);
            if (value) {
                const row = rowMap.get(blockID);
                const colName = columnKey.key?.name;
                if (colName === "封面") row.cover = value;
                else if (colName === "作者") row.author = value;
                else if (colName === "出版社") row.publisher = value;
                else if (colName === "出版年") row.publishTime = value;
                else if (colName === "ISBN") row.isbn = value;
                else if (colName === "定价") row.price = value;
                else if (colName === "页数") row.pages = value;
                else if (colName === "豆瓣评分") row.star = value;
                else if (colName === "评分人数") row.ratingCount = value;
                else if (colName === "书籍分类") row.category = value;
                else if (colName === "阅读状态") row.readingStatus = value;
            }
        }
    }

    fillColumn(coverKey, getAssetValue);
    fillColumn(authorKey, getTextValue);
    fillColumn(publisherKey, getTextValue);
    fillColumn(publishYearKey, getDateValue);
    fillColumn(isbnKey, getTextValue);
    fillColumn(priceKey, getNumberValue);
    fillColumn(pagesKey, getNumberValue);
    fillColumn(doubanStarKey, getNumberValue);
    fillColumn(ratingCountKey, getNumberValue);
    fillColumn(categoryKey, getSelectValue);
    fillColumn(readingStatusKey, getSelectValue);

    const validDocIDs = await loadValidDocIDs(docCandidateIDs);

    return Array.from(rowMap.values()).map((row) => ({
        title: row.title,
        cover: row.cover,
        author: row.author,
        publisher: row.publisher,
        publishTime: row.publishTime,
        isbn: row.isbn,
        price: row.price,
        pages: row.pages,
        star: row.star,
        ratingCount: row.ratingCount,
        category: row.category,
        readingStatus: row.readingStatus,
        localDocBlockID: validDocIDs.has(row.docCandidateID) ? row.docCandidateID : "",
        blockID: row.blockID,
        sourceType: "local_book",
    }));
}
