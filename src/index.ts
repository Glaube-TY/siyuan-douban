import { Plugin, showMessage, IModel, } from "siyuan";
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

        this.addIcons(`<symbol id="iconDouban" viewBox="0 0 1024 1024"><path d="M972.8 849.92c0 67.8656-55.0144 122.88-122.88 122.88H174.08c-67.8656 0-122.88-55.0144-122.88-122.88V174.08c0-67.8656 55.0144-122.88 122.88-122.88h675.84c67.8656 0 122.88 55.0144 122.88 122.88v675.84z" fill="#00B51D"></path><path d="M803.18464 204.8H220.81536a10.78272 10.78272 0 0 0-10.78272 10.78272v43.136c0 5.95456 4.82816 10.78272 10.78272 10.78272h582.36928a10.78272 10.78272 0 0 0 10.78272-10.78272v-43.136A10.78272 10.78272 0 0 0 803.18464 204.8zM803.18464 754.48832h-148.83328l44.48768-140.71808h55.20896a10.78272 10.78272 0 0 0 10.78272-10.78272V341.76a10.7776 10.7776 0 0 0-10.78272-10.78272h-484.096a10.78272 10.78272 0 0 0-10.78272 10.78272v261.22752c0 5.95456 4.82304 10.78272 10.78272 10.78272h341.42208l-44.4928 140.71808h-123.0336l-32.62464-103.17312c-1.87904-5.95968-8.23296-10.78272-14.18752-10.78272H331.11552c-5.95456 0-9.25696 4.82304-7.36768 10.78272l32.61952 103.17312H220.81536a10.78272 10.78272 0 0 0-10.78272 10.78272v43.14112c0 5.95456 4.82816 10.78272 10.78272 10.78272h582.36928a10.78272 10.78272 0 0 0 10.78272-10.78272v-43.14112a10.78272 10.78272 0 0 0-10.78272-10.78272z m-441.56928-219.20768V409.45664c0-5.95456 4.82304-10.78272 10.78272-10.78272h279.19872c5.95456 0 10.78272 4.83328 10.78272 10.78272v125.824a10.78272 10.78272 0 0 1-10.78272 10.78272H372.39808a10.78272 10.78272 0 0 1-10.78272-10.78272z" fill="#FFFFFF"></path></symbol>`);

        this.addTopBar({
            icon: "iconDouban",
            title: this.i18n.addTopBarIcon,
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

    async onunload() {
        showMessage(this.i18n.unload);
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
