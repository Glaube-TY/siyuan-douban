import { setAttributeViewBlockAttrStrict } from "@/api";

/** The kernel maintains custom-avs when the primary cell is bound. */
export async function bindBookToNote(avID: string, blockID: string, matchingValue: any): Promise<void> {
    const itemID = matchingValue?.blockID || blockID;
    if (!avID || !blockID || !itemID || !matchingValue?.keyID) {
        throw new Error("Invalid book note binding target");
    }
    await setAttributeViewBlockAttrStrict({
        avID,
        keyID: matchingValue.keyID,
        itemID,
        value: { isDetached: false, block: { id: blockID } },
    });
}
