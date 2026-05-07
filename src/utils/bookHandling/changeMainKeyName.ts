import { getFile, putFile, reloadAttributeView } from "@/api";
import { logError } from "../core/logger";

export async function changeMainKeyName(avID: any) {
    try {
        const response = await getFile(`/data/storage/av/${avID}.json`) as unknown as { keyValues: any[]; };

        if (response.keyValues && response.keyValues.length > 0 && response.keyValues[0].key) {
            response.keyValues[0].key.name = "书名";
            const file = new File(
                [JSON.stringify(response, null, 2)],
                `${avID}.json`,
                { type: 'application/json' }
            );

            await putFile(`/data/storage/av/${avID}.json`, false, file);

            await reloadAttributeView(avID);
        } else {
            logError("bookHandling/changeMainKeyName", "Invalid data structure - keyValues not found or empty");
        }
    } catch (error) {
        logError("bookHandling/changeMainKeyName", "Error processing file", error);
    }
}