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

        this.addIcons(`<symbol id="iconDouban" viewBox="0 0 1469 1024"><path d="M647.909198 835.259474A85.732293 85.732293 0 0 1 734.52403 920.361383a85.984447 85.984447 0 0 1 86.740908-84.849755h537.213678V72.368142H1449.88437V920.361383H821.264938a86.740908 86.740908 0 0 1-173.35574 0H18.911535V72.368142h91.783985v762.891332z" fill="#FF8875" p-id="10028"></path><path d="M734.52403 1023.996596A105.274213 105.274213 0 0 1 630.384509 939.020764H18.911535A18.911535 18.911535 0 0 1 0 920.361383V72.368142a18.911535 18.911535 0 0 1 18.911535-18.911536h91.783985v37.823071H37.823071v809.918017h610.086127a18.911535 18.911535 0 0 1 18.911535 18.911535 67.829373 67.829373 0 0 0 135.53267 0 18.911535 18.911535 0 0 1 18.911535-18.911535h610.212204V91.279677h-72.998526v-37.823071H1449.88437a18.911535 18.911535 0 0 1 18.911535 18.911536V920.361383a18.911535 18.911535 0 0 1-18.911535 18.911535H838.411397a105.40029 105.40029 0 0 1-103.887367 84.723678z" fill="#18252F" p-id="10029"></path><path d="M753.435565 920.361383h-37.823071a66.946835 66.946835 0 0 0-67.703296-65.93822H110.69552a18.911535 18.911535 0 0 1-18.911536-18.911535V18.911535A18.911535 18.911535 0 0 1 110.69552 0h623.82851v37.823071h-605.169129v778.524868h518.554297A104.769905 104.769905 0 0 1 753.435565 920.361383z" fill="#18252F" p-id="10030"></path><path d="M734.52403 939.020764a18.911535 18.911535 0 0 1-18.911536-18.911535V18.911535a18.911535 18.911535 0 0 1 18.911536-18.911535h623.954586a18.911535 18.911535 0 0 1 18.911535 18.911535v816.347939a18.911535 18.911535 0 0 1-18.911535 18.911535H821.264938A66.946835 66.946835 0 0 0 753.435565 920.361383a18.911535 18.911535 0 0 1-18.911535 18.659381zM753.435565 37.823071v802.731633a106.282828 106.282828 0 0 1 67.829373-24.206765h518.302143V37.823071zM303.719256 112.838827h233.746576v37.823071H303.719256zM215.213271 311.536024h410.884623v37.823071H215.213271zM215.213271 429.670081h410.884623v37.823071H215.213271zM215.213271 547.804138h410.884623v37.823071H215.213271zM215.213271 665.938195h410.884623v37.823071H215.213271z" fill="#18252F" p-id="10031"></path><path d="M841.059012 311.536024h411.010699v37.823071h-411.010699zM841.059012 188.358891h411.010699v37.823071h-411.010699zM841.059012 429.670081h411.010699v37.823071h-411.010699zM841.059012 547.804138h411.010699v37.823071h-411.010699zM841.059012 665.938195h411.010699v37.823071h-411.010699z" fill="#18252F" p-id="10032"></path></symbol>`);

        this.addTopBar({
            icon: "iconDouban",
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
