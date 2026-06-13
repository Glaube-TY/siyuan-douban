/**
 * 输出统一格式的错误日志
 * @param scope 模块/作用域标识，例如 'weread/updateWereadBlocks'
 * @param message 错误描述
 * @param error 可选的错误对象或附加信息
 */
export function logError(scope: string, message: string, error?: unknown): void {
    const prefix = `[${scope}]`;
    if (error !== undefined) {
        console.error(`${prefix} ${maskSensitiveText(message)}`, toSafeError(error));
    } else {
        console.error(`${prefix} ${maskSensitiveText(message)}`);
    }
}

export function maskSensitiveText(input: unknown): string {
    return String(input ?? "")
        .replace(/(api[_ -]?key["':=\s]+)([A-Za-z0-9._-]{8,})/gi, "$1***")
        .replace(/([?&]key=)([^&\s]+)/gi, "$1***")
        .replace(/(Authorization["':=\s]+Bearer\s+)([A-Za-z0-9._-]+)/gi, "$1***")
        .replace(/(Cookie["':=\s]+)([^,\n]+)/gi, "$1***");
}

export function toSafeError(error: unknown): unknown {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: maskSensitiveText(error.message),
            stack: error.stack ? maskSensitiveText(error.stack) : undefined,
        };
    }
    if (typeof error === "string") {
        return maskSensitiveText(error);
    }
    try {
        return JSON.parse(maskSensitiveText(JSON.stringify(error)));
    } catch {
        return maskSensitiveText(error);
    }
}
