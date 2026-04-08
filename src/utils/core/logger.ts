/**
 * 输出统一格式的错误日志
 * @param scope 模块/作用域标识，例如 'weread/updateWereadBlocks'
 * @param message 错误描述
 * @param error 可选的错误对象或附加信息
 */
export function logError(scope: string, message: string, error?: unknown): void {
    const prefix = `[${scope}]`;
    if (error !== undefined) {
        console.error(`${prefix} ${message}`, error);
    } else {
        console.error(`${prefix} ${message}`);
    }
}