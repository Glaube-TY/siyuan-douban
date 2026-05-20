import { svelteDialog } from "@/libs/dialog";
import wereadNotesTemplate from "@/components/common/wereadNotesTemplate.svelte";
import allNotebooks from "@/components/common/allNotebooks.svelte";
import wereadBookShelfView from "@/components/common/wereadBookShelfView.svelte";
import wereadReadingStatsDialog from "@/components/common/wereadReadingStatsDialog.svelte";

export const createWereadNotesTemplateDialog = (i18n: any, onConfirm: (newWereadTemplates: string) => void, initialTemplates = "", title: string) => {
    return () => {
        const dialog = svelteDialog({
            title: title,
            constructor: (containerEl: HTMLElement) => {
                return new wereadNotesTemplate({
                    target: containerEl,
                    props: {
                        i18n: i18n,
                        newWereadTemplates: initialTemplates,
                        close: () => dialog.close(),
                        confirm: (newWereadTemplates: string) => {
                            onConfirm(newWereadTemplates);
                            dialog.close();
                        }
                    }
                });
            }
        });
    };
};

export const createBookShelfDialog = (plugin: any, books: any) => {
    return () => {
        let dialogRef: any;
        dialogRef = svelteDialog({
            title: plugin.i18n.bookShelfTitle,
            width: "880px",
            height: "82vh",
            constructor: (containerEl: HTMLElement) => {
                return new wereadBookShelfView({
                    target: containerEl,
                    props: {
                        plugin,
                        books,
                        closeDialog: () => dialogRef?.close?.(),
                    }
                });
            }
        });
    };
};

export const createNotebooksDialog = (plugin: any, books: any[]) => {
    return () => {
        let dialogRef: any;
        dialogRef = svelteDialog({
            title: plugin.i18n.bookNotesTitle,
            width: "880px",
            height: "82vh",
            constructor: (containerEl: HTMLElement) => {
                return new allNotebooks({
                    target: containerEl,
                    props: {
                        plugin,
                        books,
                        closeDialog: () => dialogRef?.close?.(),
                    }
                });
            }
        });
    };
};

export const createLocalBookShelfDialog = (plugin: any, books: any) => {
    return () => {
        let dialogRef: any;
        dialogRef = svelteDialog({
            title: plugin.i18n.localBookShelfTitle || "本地书架",
            width: "880px",
            height: "82vh",
            constructor: (containerEl: HTMLElement) => {
                return new wereadBookShelfView({
                    target: containerEl,
                    props: {
                        plugin,
                        books,
                        closeDialog: () => dialogRef?.close?.(),
                        showLocalDocBadge: false,
                        openAllBooks: true,
                    }
                });
            }
        });
    };
};

export const createWereadReadingStatsDialog = (plugin: any, stats: any) => {
    return () => {
        svelteDialog({
            title: plugin.i18n.wereadReadingStatsDialogTitle || "阅读统计",
            width: "980px",
            height: "82vh",
            constructor: (containerEl: HTMLElement) => {
                return new wereadReadingStatsDialog({
                    target: containerEl,
                    props: {
                        i18n: plugin.i18n,
                        stats,
                    },
                });
            },
        });
    };
};
