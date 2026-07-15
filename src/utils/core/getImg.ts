import { forwardProxyStrict, putFile } from "@/api";
import { formatTime } from "./formatOp";
import { logError } from "./logger";
import { DOUBAN_DESKTOP_USER_AGENT } from "../douban/book/getWebPage";

function normalizeImageMime(contentType: string, base64Data: string): string {
    const normalized = String(contentType || "").split(";")[0].trim().toLowerCase();
    if (normalized.startsWith("image/")) return normalized;

    if (base64Data.startsWith("/9j/")) return "image/jpeg";
    if (base64Data.startsWith("iVBOR")) return "image/png";
    if (base64Data.startsWith("UklGR")) return "image/webp";
    if (base64Data.startsWith("R0lGOD")) return "image/gif";
    return "";
}

function buildImageCandidateUrls(rawUrl: string): string[] {
    const normalizedUrl = rawUrl.replace(/^http:/, "https:");
    const urls = [normalizedUrl];

    try {
        const parsed = new URL(normalizedUrl);
        if (/^img\d+\.doubanio\.com$/i.test(parsed.hostname)) {
            for (const hostname of ["img1.doubanio.com", "img2.doubanio.com", "img3.doubanio.com"]) {
                if (hostname === parsed.hostname) continue;
                const fallback = new URL(parsed.href);
                fallback.hostname = hostname;
                urls.push(fallback.href);
            }
        }
    } catch {
        // URL 已在入口处校验；解析失败时保留原地址交给代理返回具体错误。
    }

    return Array.from(new Set(urls));
}

export async function getImage(url: string, referer: string = "https://book.douban.com/"): Promise<string> {
    if (!/^https?:\/\//i.test(String(url || ""))) return "";

    let lastError: unknown = null;
    for (const candidateUrl of buildImageCandidateUrls(url)) {
        try {
            const response = await forwardProxyStrict(
                candidateUrl,
                "GET",
                "",
                [
                    { "User-Agent": DOUBAN_DESKTOP_USER_AGENT },
                    { Referer: referer },
                    { Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" },
                ],
                15000,
                "text/html",
                "base64",
                "text",
            );

            if (response.status < 200 || response.status >= 300 || !response.body) {
                throw new Error(`图片请求失败（HTTP ${response.status || "未知"}）`);
            }

            const mimeType = normalizeImageMime(response.contentType, response.body);
            if (!mimeType) {
                throw new Error(`封面响应不是有效图片（${response.contentType || "未知类型"}）`);
            }
            return `data:${mimeType};base64,${response.body}`;
        } catch (error) {
            lastError = error;
        }
    }

    logError("core/getImg", "图片获取失败", lastError);
    return "";
}

export async function downloadCover(base64Data: string, title: string) {
    const matches = base64Data.match(/^data:(image\/[-+\w.]+);base64,/);
    if (!matches || matches.length < 2) {
        throw new Error("无效的 Base64 图片数据");
    }

    const mimeType = matches[1];
    const extByMime: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
    };
    const fileExt = extByMime[mimeType] || "jpg";
    const cleanTitle = title.replace(/[^\w\u4e00-\u9fa5]/g, "_");
    const timestamp = formatTime();
    const fileName = `${cleanTitle}_${timestamp}.${fileExt}`;
    const filePath = `/data/assets/covers/${fileName}`;

    const byteString = atob(base64Data.split(",")[1]);
    const uint8Array = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
        uint8Array[i] = byteString.charCodeAt(i);
    }
    const imageFile = new File([uint8Array], fileName, { type: mimeType });

    await putFile(filePath, false, imageFile);
    return `assets/covers/${fileName}`;
}
