import { svelteDialog } from "@/libs/dialog";
import WereadSyncPlanConfirmDialog from "@/components/common/WereadSyncPlanConfirmDialog.svelte";
import { t } from "../../i18n";
import type { WereadSyncPlanConfirmPayload } from "./wereadSyncProgress";

export function confirmWereadSyncPlan(plugin: any, payload: WereadSyncPlanConfirmPayload): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);
  return new Promise(resolve => {
    const mobile = window.matchMedia?.("(max-width: 600px)").matches;
    const dialog = svelteDialog({ title: t(plugin, "planTitle", "确认微信读书同步"),
      width: mobile ? "100vw" : "min(560px, 92vw)", height: mobile ? "100dvh" : "min(560px, 85vh)",
      disableClose: true, hideCloseIcon: true,
      constructor: target => new WereadSyncPlanConfirmDialog({ target, props: { plugin, payload,
        onConfirm: () => { dialog.close(); resolve(true); }, onCancel: () => { dialog.close(); resolve(false); },
      } }),
    });
    if (mobile) dialog.dialog.element.classList.add("siyuan-douban-mobile-subdialog");
  });
}
