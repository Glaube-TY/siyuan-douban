import { fetchSyncPost, IWebSocketData, getFrontend } from "siyuan";
import { getWorkspaceInfo, getConf, render, updateBlock } from "@/api";

/**
 * 统一读书笔记模板渲染工具
 * 内部按 getFrontend() 分支：
 * - browser-desktop / browser-mobile：使用 workspaceDir 路径，严格 fetchSyncPost
 * - desktop / desktop-window / mobile：保持原有 dataDir 路径，复用 render + updateBlock API
 *
 * @param plugin 插件实例（用于 saveData）
 * @param blockID 目标文档 blockID
 * @param template 模板内容字符串
 */
export async function renderBookNoteTemplate(
    plugin: any,
    blockID: string,
    template: string
): Promise<void> {
    // 保存模板数据到插件 data 目录（所有前端共用）
    await plugin.saveData("noteTemplate.md", template);

    const frontEnd = getFrontend();
    const isBrowser = frontEnd === "browser-desktop" || frontEnd === "browser-mobile";

    if (isBrowser) {
        // ========== 浏览器前端路径 ==========

        // 获取工作空间目录
        const wsInfo = await getWorkspaceInfo();
        if (!wsInfo || !wsInfo.workspaceDir) {
            throw new Error("无法获取工作空间目录 (workspaceDir)，请确认思源内核已启动");
        }

        // 组装工作空间内的绝对路径，规范化分隔符
        let workspaceDir = wsInfo.workspaceDir.replace(/\\/g, "/").replace(/\/+$/, "");
        const templatePath = workspaceDir + "/data/storage/petal/siyuan-douban/noteTemplate.md";

        // 调用 /api/template/render（严格版：code 非 0 时抛错）
        const response: IWebSocketData = await fetchSyncPost('/api/template/render', {
            id: blockID,
            path: templatePath
        });

        if (response.code !== 0) {
            const msg = response.msg || `模板渲染失败 (code=${response.code})`;
            throw new Error(`模板渲染失败: ${msg}。路径: ${templatePath}`);
        }

        // 严格验证返回值：content 必须是字符串
        const data = response.data;
        if (!data || typeof data.content !== 'string') {
            throw new Error(
                `模板渲染返回值异常：content 不是字符串 (type=${typeof data?.content})。路径: ${templatePath}`
            );
        }

        // 更新文档内容
        const updateResponse: IWebSocketData = await fetchSyncPost('/api/block/updateBlock', {
            dataType: "dom",
            data: data.content,
            id: blockID
        });

        if (updateResponse.code !== 0) {
            const msg = updateResponse.msg || `更新块内容失败 (code=${updateResponse.code})`;
            throw new Error(`更新块内容失败: ${msg}。blockID: ${blockID}`);
        }
    } else {
        // ========== PC/手机原有稳定路径 ==========
        // 保持修改前已经正常工作的路径逻辑

        const conf = await getConf();
        const dataDir = conf.conf.system.dataDir;
        const rendered = await render(blockID, dataDir + "/storage/petal/siyuan-douban/noteTemplate.md");
        await updateBlock("dom", rendered.content, blockID);
    }
}
