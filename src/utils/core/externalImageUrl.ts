const HTTPS_CAPABLE_IMAGE_HOSTS = /(^|\.)(qlogo\.cn|qpic\.cn)$/i;

export function secureExternalImageUrl(value: unknown): string {
    const url = String(value || "").trim();
    if (!url.toLowerCase().startsWith("http://")) return url;

    try {
        const parsed = new URL(url);
        if (HTTPS_CAPABLE_IMAGE_HOSTS.test(parsed.hostname)) {
            parsed.protocol = "https:";
            return parsed.href;
        }
    } catch {
        return url;
    }

    return url;
}
