import { callWereadApi } from "./wereadApiGateway";

export interface WereadApiMpArticleInfo {
    reviewId: string;
    title: string;
    docUrl?: string;
    cover?: string;
    mpName?: string;
    publishTime?: number;
    raw?: unknown;
}

export async function fetchWereadApiMpArticleInfo(
    apiKey: string,
    articleId: string
): Promise<WereadApiMpArticleInfo | null> {
    if (!articleId) return null;

    try {
        const result = await callWereadApi<any>(apiKey, "/review/single", {
            reviewId: articleId,
            commentsCount: 10,
            commentsDirection: 0,
            likesCount: 10,
            likesDirection: 0,
            synckey: 0,
        });

        const mpInfo = result?.review?.mpInfo;
        if (!mpInfo || !mpInfo.title) return null;

        return {
            reviewId: articleId,
            title: mpInfo.title,
            docUrl: mpInfo.doc_url || "",
            cover: mpInfo.pic_url || "",
            mpName: mpInfo.mp_name || "",
            publishTime: mpInfo.time || 0,
            raw: result,
        };
    } catch {
        return null;
    }
}
