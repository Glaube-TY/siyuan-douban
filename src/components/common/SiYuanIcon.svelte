<script lang="ts">
    import { resolveSiYuanIconName, isImageIconName, resolveImageIconSrc } from "../../utils/icons/siyuanIconMap";

    export let name: string = "";
    export let size: number | string = 16;
    export let className: string = "";
    export let title: string = "";
    export let pluginName: string = "";
    export let imageSrc: string = "";

    $: iconName = resolveSiYuanIconName(name);
    $: isImage = isImageIconName(name);
    $: resolvedSize = typeof size === "number" ? `${size}px` : size;
    $: resolvedImageSrc = imageSrc || resolveImageIconSrc(name, pluginName);
</script>

{#if isImage && resolvedImageSrc}
    <img
        class={`common-icon common-icon--image ${className}`}
        src={resolvedImageSrc}
        alt={title}
        title={title}
        aria-hidden={title ? "false" : "true"}
        style={`width: ${resolvedSize}; height: ${resolvedSize};`}
    />
{:else}
    <svg
        class={`common-icon common-icon--svg ${className}`}
        aria-hidden={title ? "false" : "true"}
        role={title ? "img" : undefined}
        style={`width: ${resolvedSize}; height: ${resolvedSize};`}
    >
        {#if title}
            <title>{title}</title>
        {/if}
        <use href={`#${iconName}`}></use>
    </svg>
{/if}

<style>
    .common-icon {
        display: inline-block;
        flex: 0 0 auto;
        vertical-align: -0.15em;
    }

    .common-icon--svg {
        color: currentColor;
        fill: currentColor;
        stroke: none;
    }

    .common-icon--image {
        object-fit: contain;
        border-radius: 4px;
    }
</style>
