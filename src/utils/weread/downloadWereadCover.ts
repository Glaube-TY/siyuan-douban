import { putFile } from "@/api";
import { formatTime } from '../core/formatOp';

export async function downloadWereadCoverSafely(coverUrl: string, title: string): Promise<string> {
    if (!coverUrl) {
        return "";
    }

    if (!coverUrl.startsWith("http://") && !coverUrl.startsWith("https://")) {
        return "";
    }

    try {
        const response = await fetch(coverUrl);
        if (!response.ok) {
            return "";
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("image")) {
            return "";
        }

        const blob = await response.blob();
        const fileExt = getExtensionFromContentType(contentType);
        const cleanTitle = title.replace(/[^\w\u4e00-\u9fa5]/g, "_");
        const timestamp = formatTime();
        const fileName = `${cleanTitle}_${timestamp}.${fileExt}`;
        const filePath = `/data/assets/covers/${fileName}`;

        const file = new File([blob], fileName, { type: contentType });
        await putFile(filePath, false, file);

        return `assets/covers/${fileName}`;
    } catch {
        return "";
    }
}

function getExtensionFromContentType(contentType: string): string {
    if (contentType.includes("jpeg")) {
        return "jpg";
    }
    if (contentType.includes("png")) {
        return "png";
    }
    if (contentType.includes("webp")) {
        return "webp";
    }
    return "jpg";
}
