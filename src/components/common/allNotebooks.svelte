<script lang="ts">
    import WereadBookShelfView from "./wereadBookShelfView.svelte";

    export let plugin: any;
    export let closeDialog: () => void = () => {};
    export let books: Array<{
        title: string;
        author: string;
        categories: string[];
        noteCount: number;
        reviewCount: number;
        cover: string;
        publishTime: string;
        price: number;
        format: string;
        isbn: string;
        publisher: string;
        totalWords: number;
        star: number;
        ratingCount: number;
        intro: string;
        localDocBlockID?: string;
        localDocMatchType?: string;
    }>;
</script>

<WereadBookShelfView {plugin} {closeDialog} {books} />
