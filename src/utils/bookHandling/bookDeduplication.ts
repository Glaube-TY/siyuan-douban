export function normalizeBookTitle(value: unknown): string {
    return String(value || "")
        .normalize("NFKC")
        .trim()
        .replace(/^《(.+)》$/u, "$1")
        .replace(/\s+/g, " ")
        .toLowerCase();
}

export function getAttributeViewValueText(value: any): string {
    return String(
        value?.block?.content
        ?? value?.text?.content
        ?? value?.number?.formattedContent
        ?? value?.number?.content
        ?? ""
    ).trim();
}

export function findBookByNormalizedTitle(keyValues: any[], title: unknown): any | null {
    const normalizedTitle = normalizeBookTitle(title);
    if (!normalizedTitle || !Array.isArray(keyValues)) return null;

    const bookNameKey = keyValues.find((item: any) => item?.key?.name === "书名");
    return (bookNameKey?.values || []).find((value: any) => (
        normalizeBookTitle(getAttributeViewValueText(value)) === normalizedTitle
    )) || null;
}
