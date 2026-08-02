<script lang="ts">
    export let href: string;
    export let label: string;
    export let compact = false;
</script>

<a
    class:compact
    class="context-tutorial-link"
    {href}
    target="_blank"
    rel="noopener noreferrer"
    on:click|stopPropagation
>
    <span>{label}</span>
    <span class="context-tutorial-link-arrow" aria-hidden="true">↗</span>
</a>

<style>
    .context-tutorial-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        width: fit-content;
        min-height: 30px;
        padding: 0 10px;
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 45%, var(--b3-border-color));
        border-radius: 7px;
        background: color-mix(in srgb, var(--b3-theme-primary) 7%, var(--b3-theme-surface));
        color: var(--b3-theme-primary);
        font-size: 12px;
        font-weight: 600;
        line-height: 1.2;
        text-decoration: none;
        cursor: pointer;
        transition: border-color 0.16s ease, background 0.16s ease;
    }

    .context-tutorial-link:hover,
    .context-tutorial-link:focus-visible {
        border-color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 13%, var(--b3-theme-surface));
        outline: none;
    }

    .context-tutorial-link.compact {
        min-height: 26px;
        padding: 0 8px;
        font-size: 11px;
    }

    .context-tutorial-link-arrow {
        font-size: 0.9em;
        opacity: 0.78;
    }
</style>
