import { fetchSyncPost, getFrontend, IWebSocketData } from "siyuan";
import { getWorkspaceInfo, getConf } from "@/api";

const TEMPLATE_FILE_PATH = "/data/templates/.siyuan-douban/noteTemplate.md";

function getKernelMessage(response: IWebSocketData): string {
    const data = response.data as any;
    return response.msg || (typeof data === "string" ? data : data?.msg) || `code=${response.code}`;
}

async function requestKernel(stage: string, url: string, data: any): Promise<any> {
    try {
        const response: IWebSocketData = await fetchSyncPost(url, data);
        if (response.code !== 0) {
            throw new Error(`${stage}失败：${getKernelMessage(response)}`);
        }
        return response.data;
    } catch (error) {
        if (error instanceof Error && error.message.startsWith(`${stage}失败：`)) {
            throw error;
        }
        throw new Error(`${stage}失败：${error instanceof Error ? error.message : String(error)}`);
    }
}

function joinAbsolutePath(root: string, suffix: string): string {
    return `${root.replace(/\\/g, "/").replace(/\/+$/, "")}${suffix}`;
}

async function getTemplateAbsolutePath(): Promise<string> {
    const frontEnd = getFrontend();
    if (frontEnd === "browser-desktop" || frontEnd === "browser-mobile") {
        const wsInfo = await getWorkspaceInfo();
        if (!wsInfo?.workspaceDir) {
            throw new Error("无法获取工作空间目录 (workspaceDir)，请确认思源内核已启动");
        }
        return joinAbsolutePath(wsInfo.workspaceDir, TEMPLATE_FILE_PATH);
    }

    const conf = await getConf();
    const dataDir = conf?.conf?.system?.dataDir;
    if (!dataDir) {
        throw new Error("无法获取数据目录 (dataDir)，请确认思源内核已启动");
    }
    return joinAbsolutePath(dataDir, "/templates/.siyuan-douban/noteTemplate.md");
}

async function writeTemplate(template: string): Promise<void> {
    const form = new FormData();
    form.append("path", TEMPLATE_FILE_PATH);
    form.append("isDir", "false");
    form.append("modTime", Math.floor(Date.now() / 1000).toString());
    form.append(
        "file",
        new File([new TextEncoder().encode(template)], "noteTemplate.md", { type: "text/markdown" }),
    );
    await requestKernel("模板写入", "/api/file/putFile", form);
}

/**
 * 使用思源内部模板渲染读书笔记。
 * 模板先写入 data/templates 下的固定隐藏文件，再由内核渲染并更新目标文档。
 */
export async function renderBookNoteTemplate(blockID: string, template: string): Promise<void> {
    const templatePath = await getTemplateAbsolutePath();
    await writeTemplate(template);

    const rendered = await requestKernel("模板渲染", "/api/template/render", {
        id: blockID,
        path: templatePath,
    });
    if (!rendered || typeof rendered.content !== "string") {
        throw new Error(`模板渲染失败：内核返回的 content 不是字符串 (type=${typeof rendered?.content})`);
    }

    await requestKernel("更新块内容", "/api/block/updateBlock", {
        dataType: "dom",
        data: rendered.content,
        id: blockID,
    });
}
