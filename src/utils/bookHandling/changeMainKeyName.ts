import { fetchSyncPost, fetchPost } from "siyuan";

// ==== 将主键名改为“书名” ====
export async function changeMainKeyName(avID: any) {
    try {
        // 获取文件内容
        const response = await fetchSyncPost('/api/file/getFile', {
            path: `/data/storage/av/${avID}.json`
        }) as unknown as { keyValues: any[]; };

        // 修改数据
        if (response.keyValues && response.keyValues.length > 0 && response.keyValues[0].key) {
            response.keyValues[0].key.name = "书名";
            const formData = new FormData();
            formData.append("path", `/data/storage/av/${avID}.json`);
            formData.append("file", new File(
                [JSON.stringify(response, null, 2)],
                `${avID}.json`,
                { type: 'application/json' }
            ));

            const putResponse = await fetchSyncPost('/api/file/putFile', formData);

            if (putResponse.code !== 0) {
                throw new Error(putResponse.msg || "保存数据库文件失败");
            }

            // 刷新数据库视图
            fetchPost("/api/ui/reloadAttributeView", { id: avID });
        } else {
            console.error("Invalid data structure - keyValues not found or empty");
        }
    } catch (error) {
        console.error("Error processing file:", error);
    }
}