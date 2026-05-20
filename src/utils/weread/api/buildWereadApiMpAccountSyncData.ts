import { callWereadApi } from "./wereadApiGateway";
import type { RawBookInfoResponse } from "./types/raw";
import { buildMpArticleSyncUnits, type MpBookInfo, type MpArticleSyncUnit } from "../mpArticleSync";
import { fetchWereadApiMpArticleInfo } from "./fetchWereadApiMpArticleInfo";

interface WereadApiBookmarkPayload {
    updated?: Array<{
        bookId: string;
        bookmarkId?: string;
        markText?: string;
        range?: string;
        createTime?: number;
        type?: number;
        refMpReviewId?: string;
    }>;
    synckey?: number;
    removed?: unknown[];
}

interface WereadApiReviewPayload {
    reviews?: Array<{
        reviewId?: string;
        review?: {
            reviewId?: string;
            range?: string;
            content?: string;
            createTime?: number;
            refMpInfo?: {
                reviewId?: string;
                title?: string;
                pic_url?: string;
                picUrl?: string;
                createTime?: number;
            };
            abstract?: string;
            contextAbstract?: string;
        };
    }>;
    synckey?: number;
    hasMore?: number;
    totalCount?: number;
}

const MAX_MP_REVIEW_PAGES = 100;
const MAX_MP_ARTICLE_TITLE_ENRICH = 50;

async function fetchAllMpReviews(apiKey: string, mpBookID: string): Promise<WereadApiReviewPayload> {
    const allReviews: WereadApiReviewPayload["reviews"] = [];
    let synckey = 0;
    let hasMore = 1;
    let page = 0;

    while (hasMore && page < MAX_MP_REVIEW_PAGES) {
        const result = await callWereadApi<WereadApiReviewPayload>(
            apiKey,
            "/review/list/mine",
            { bookid: mpBookID, count: 100, synckey }
        );

        const reviews = result.reviews || [];
        if (reviews.length === 0) break;

        allReviews.push(...reviews);

        hasMore = result.hasMore ?? 0;

        const nextSynckey = result.synckey;
        if (typeof nextSynckey !== "number") break;
        if (nextSynckey === synckey) break;
        synckey = nextSynckey;

        page++;
    }

    return { reviews: allReviews, synckey, hasMore: 0 };
}

async function enrichMpArticleUnitsWithTitles(
    apiKey: string,
    units: MpArticleSyncUnit[]
): Promise<MpArticleSyncUnit[]> {
    let enriched = 0;
    for (const unit of units) {
        if (enriched >= MAX_MP_ARTICLE_TITLE_ENRICH) break;

        const currentTitle = unit.articleTitle || "";
        if (currentTitle && !currentTitle.startsWith("公众号文章_") && !currentTitle.startsWith("未知公众号文章_")) continue;

        try {
            const info = await fetchWereadApiMpArticleInfo(apiKey, unit.articleID);
            if (info?.title) {
                unit.articleTitle = info.title;
                enriched++;
            }
        } catch {
            // 单篇失败不影响其他文章
        }
    }
    return units;
}

export async function buildWereadApiMpAccountSyncData(
    apiKey: string,
    mpBookID: string
): Promise<{
    rawBookID: string;
    accountInfo: {
        rawBookID: string;
        accountTitle: string;
        accountIntro: string;
        accountCover: string;
        updateTime: number;
    };
    articleUnits: MpArticleSyncUnit[];
    articleCount: number;
    noteCount: number;
}> {
    const [bookInfoResult, bookmarkResult] = await Promise.all([
        callWereadApi<RawBookInfoResponse>(apiKey, "/book/info", { bookId: mpBookID }),
        callWereadApi<WereadApiBookmarkPayload>(apiKey, "/book/bookmarklist", { bookId: mpBookID }),
    ]);

    const reviewResult = await fetchAllMpReviews(apiKey, mpBookID);

    const bookInfo: MpBookInfo = {
        bookId: bookInfoResult.bookId || mpBookID,
        title: bookInfoResult.title || "",
        author: bookInfoResult.author || "",
        cover: bookInfoResult.cover || "",
        intro: bookInfoResult.intro || "",
        type: 3,
        updateTime: bookmarkResult.synckey || reviewResult.synckey || 0,
    };

    const articleUnits = buildMpArticleSyncUnits(mpBookID, bookInfo, bookmarkResult as any, reviewResult as any);

    const enrichedUnits = await enrichMpArticleUnitsWithTitles(apiKey, articleUnits);

    let totalNotes = 0;
    for (const unit of enrichedUnits) {
        totalNotes += unit.notes.length;
    }

    return {
        rawBookID: mpBookID,
        accountInfo: {
            rawBookID: mpBookID,
            accountTitle: bookInfo.title,
            accountIntro: bookInfo.intro,
            accountCover: bookInfo.cover,
            updateTime: bookInfo.updateTime || 0,
        },
        articleUnits: enrichedUnits,
        articleCount: enrichedUnits.length,
        noteCount: totalNotes,
    };
}
