import { openTab, openMobileFileById } from "siyuan";

export type DocOpenMode = 0 | 1 | 2;

export function openDoc(plugin: any, id: string, mode: DocOpenMode = 1) {
  if (!id) return;

  if (plugin.isMobile) {
    if (plugin.currentMobileDialog) {
      plugin.currentMobileDialog.close();
      plugin.currentMobileDialog = null;
    }
    openMobileFileById(plugin.app, id);
    return;
  }

  openTab({
    app: plugin.app,
    doc: { id, mode } as any,
  });
}
