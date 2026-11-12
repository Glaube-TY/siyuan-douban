import { fetchSyncPost, getFrontend, IWebSocketData } from "siyuan";
import { getWorkspaceInfo, getConf } from "@/api";
import { t } from "../i18n";
import { generateUniqueBlocked } from "../core/formatOp";

export const BOOK_NOTE_READBACK_DELAYS = [0, 100, 250, 500, 1000, 2000, 4000];


function getKernelMessage(response: IWebSocketData): string {
    const data = response.data as any;
    return (response.msg || (typeof data === "string" ? data : data?.msg) || "Kernel request rejected") + " (code=" + response.code + ")";
}

async function requestKernel(stage: string, url: string, data: any): Promise<any> {
    try {
        const response: IWebSocketData = await fetchSyncPost(url, data);
        if (response.code !== 0) {
            throw new Error(`${stage}: ${getKernelMessage(response)}`);
        }
        return response.data;
    } catch (error) {
        if (error instanceof Error && error.message.startsWith(`${stage}: `)) {
            throw error;
        }
        throw new Error(`${stage}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function joinAbsolutePath(root: string, suffix: string): string {
    return `${root.replace(/\\/g, "/").replace(/\/+$/, "")}${suffix}`;
}

async function getTemplateAbsolutePath(filePath: string, i18nSource?: any): Promise<string> {
    const frontEnd = getFrontend();
    if (frontEnd === "browser-desktop" || frontEnd === "browser-mobile") {
        const wsInfo = await getWorkspaceInfo();
        if (!wsInfo?.workspaceDir) {
            throw new Error(t(i18nSource, "bookNoteWorkspaceUnavailable", "无法获取工作空间目录，请确认思源内核已启动"));
        }
        return joinAbsolutePath(wsInfo.workspaceDir, filePath);
    }

    const conf = await getConf();
    const dataDir = conf?.conf?.system?.dataDir;
    if (!dataDir) {
        throw new Error(t(i18nSource, "bookNoteDataDirUnavailable", "无法获取数据目录，请确认思源内核已启动"));
    }
    return joinAbsolutePath(dataDir, filePath.slice("/data".length));
}

async function writeTemplate(template: string, filePath: string, i18nSource?: any): Promise<void> {
    const form = new FormData();
    form.append("path", filePath);
    form.append("isDir", "false");
    form.append("modTime", Math.floor(Date.now() / 1000).toString());
    form.append(
        "file",
        new File([new TextEncoder().encode(template)], "noteTemplate.md", { type: "text/markdown" }),
    );
    await requestKernel(t(i18nSource, "bookNoteTemplateWrite", "写入模板文件"), "/api/file/putFile", form);
}

export function hasBookNoteContent(kramdown: string): boolean {
    return !!kramdown.replace(/^\s*\{:[^\r\n]*\}\s*$/gm, "").replace(/[\s\u200b\ufeff]/g, "");
}

export async function readBookNoteKramdown(blockID: string, i18nSource?: any): Promise<string> {
    const data = await requestKernel(t(i18nSource, "bookNoteRead", "读取笔记正文"), "/api/block/getBlockKramdown", { id: blockID });
    if (typeof data?.kramdown !== "string") {
        throw new Error(t(i18nSource, "bookNoteReadInvalid", "笔记正文读取结果无效，已停止写入"));
    }
    return data.kramdown;
}

function hasRenderedContent(content: string): boolean {
    const text = content.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, "")
        .replace(/&nbsp;|&#(?:160|8203|65279);|&#x(?:a0|200b|feff);/gi, "");
    return !!text.replace(/[\s\u200b\ufeff]/g, "")
        || /<(?:img|video|audio|iframe|table|hr|svg|canvas|object|embed)\b|data-type=["'](?:NodeCodeBlock|NodeMathBlock|NodeThematicBreak|NodeWidget|NodeAttributeView)["']/i.test(content);
}

/** Append only to an empty note; concurrent user edits are never replaced. */
export async function renderBookNoteTemplate(blockID: string, template: string, i18nSource?: any, requireContent = false): Promise<void> {
    if (hasBookNoteContent(await readBookNoteKramdown(blockID, i18nSource))) return;
    if (typeof template !== "string" || (requireContent && !template.trim())) {
        throw new Error(t(i18nSource, "bookNoteTemplateEmpty", "请先配置非空的读书笔记模板"));
    }
    // Frontends and background WeRead imports must not share a mutable template file.
    const filePath = "/data/templates/.siyuan-douban/noteTemplate-" + generateUniqueBlocked() + ".md";
    const templatePath = await getTemplateAbsolutePath(filePath, i18nSource);
    let rendered: any;
    try {
        await writeTemplate(template, filePath, i18nSource);
        rendered = await requestKernel(t(i18nSource, "bookNoteRender", "模板渲染"), "/api/template/render", { id: blockID, path: templatePath });
    } finally {
        try { await requestKernel("Remove temporary template", "/api/file/removeFile", { path: filePath }); }
        catch { console.warn("[book-note] Temporary template cleanup unavailable"); }
    }
    if (typeof rendered?.content !== "string" || (requireContent && !hasRenderedContent(rendered.content))) {
        throw new Error(t(i18nSource, "bookNoteRenderedEmpty", "模板未生成有效正文，已停止写入"));
    }
    if (hasBookNoteContent(await readBookNoteKramdown(blockID, i18nSource))) return;
    // WeRead may intentionally start with an empty template and fill it during sync.
    const expectContent = hasRenderedContent(rendered.content);
    let writeError: unknown;
    if (expectContent) {
        try {
            await requestKernel(t(i18nSource, "bookNoteWrite", "写入笔记正文"), "/api/block/appendBlock", {
                dataType: "dom", data: rendered.content, parentID: blockID,
            });
        } catch (error) {
            writeError = error;
        }
    }
    // A lost response can follow a successful write; read back before offering retry.
    let contentVerified = false;
    for (const delay of BOOK_NOTE_READBACK_DELAYS) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        if (hasBookNoteContent(await readBookNoteKramdown(blockID, i18nSource)) || !expectContent) {
            contentVerified = true;
            const blocks = await requestKernel(t(i18nSource, "bookNoteStageVerify", "状态校验"), "/api/query/sql", {
                stmt: "SELECT id, type FROM blocks WHERE id = '" + blockID.replace(/'/g, "''") + "'",
            });
            if (!Array.isArray(blocks) || blocks.some((block: any) => block.id !== blockID || block.type !== "d")) {
                throw new Error(t(i18nSource, "bookNoteReadInvalid", "笔记正文读取结果无效，已停止写入"));
            }
            if (blocks.length === 1) return;
        }
    }
    throw writeError || new Error(contentVerified
        ? t(i18nSource, "bookNoteIndexUnverified", "笔记已写入，但文档索引尚未就绪，请稍后补全")
        : t(i18nSource, "bookNoteContentUnverified", "笔记正文回读验证未通过，请稍后补全"));
}
