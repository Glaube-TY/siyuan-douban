import { Plugin, IModel, } from "siyuan";
import setPage from "./components/index.svelte";
import { svelteDialog } from "./libs/dialog";
import * as sdk from "@siyuan-community/siyuan-sdk";
import { syncWereadNotes } from "./utils/weread/syncWereadNotes";

const STORAGE_NAME = "menu-config";

export default class PluginSample extends Plugin {

    customTab: () => IModel;

    client = new sdk.Client(undefined, 'fetch');

    async onload() {
        this.data[STORAGE_NAME] = { readonlyText: "Readonly" };

        this.i18n = {...this.i18n,};

        await this.loadData(STORAGE_NAME);

        this.addIcons(`<symbol id="iconNotebook" viewBox="0 0 1024 1024"><path d="M784 260.266667h145.066667v208.853333h-145.066667zM784 522.026667h145.066667v208.853333h-145.066667zM784 784h145.066667V960h-145.066667zM929.066667 207.36V64h-145.066667v143.36h145.066667z" fill="#A25C11" p-id="18569"></path><path d="M133.546667 64c-21.12 0-38.613333 16.64-38.613334 36.906667v822.4c0 20.266667 17.28 36.906667 38.613334 36.906666h580.48V64H133.546667z m260.906666 523.52h-130.986666c-14.506667 0-26.453333-11.946667-26.453334-26.453333V168.32c0-14.506667 11.946667-26.453333 26.453334-26.453333h130.986666c14.506667 0 26.453333 11.946667 26.453334 26.453333V561.066667c0 14.72-11.946667 26.453333-26.453334 26.453333z" fill="#333333" p-id="18570"></path><path d="M290.133333 194.773333h77.866667v339.626667H290.133333z" fill="#A25C11" p-id="18571"></path></symbol>`);

        this.addTopBar({
            icon: "iconNotebook",
            title: "读书笔记",
            position: "right",
            callback: () => {
                this.showDialog();
            }
        });
    }

    async onLayoutReady() { 
        const wereadSetting = await this.loadData("weread_settings");
        const autoSync = wereadSetting.autoSync;
        const savedCookie = await this.loadData("weread_cookie");

        if (autoSync) {
            await syncWereadNotes(this, savedCookie,true);
        }
    }

    private showDialog() {
        svelteDialog({
            title: this.i18n.setTitle,
            width:  "auto",
            constructor: (container: HTMLElement) => {
                return new setPage({
                    target: container,
                    props: {
                        app: this.app,
                        i18n: this.i18n,
                        plugin: this,
                    }
                });
            }
        });
    }
}
