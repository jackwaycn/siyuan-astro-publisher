<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import type { AstroPaperGithubPublisher, BlogPublishSettings, PublishDraft } from "./publish/astro-paper";
    import { splitTags, slugify } from "./publish/astro-paper";

    export let docId: string;
    export let i18n: Record<string, string>;
    export let settings: BlogPublishSettings;
    export let publisher: AstroPaperGithubPublisher;
    export let onOpenSettings: () => void;
    export let onPublished: (url: string) => void;

    let loading = true;
    let publishing = false;
    let error = "";
    let resultUrl = "";
    let draft: PublishDraft | null = null;
    let tagText = "";
    let commitMessage = "";
    let overwrite = true;

    $: isConfigured = Boolean(settings.owner && settings.repo && settings.token);
    $: assetCount = draft?.assetRefs.length ?? 0;
    $: markdownPath = draft ? `${settings.contentDir}/${draft.slug}.md` : "";

    onMount(async () => {
        await loadDraft();
    });

    async function loadDraft() {
        loading = true;
        error = "";
        try {
            draft = await publisher.createDraft(docId);
            tagText = draft.tags.join(", ");
            commitMessage = `Publish ${draft.title}`;
        } catch (err) {
            error = getErrorMessage(err);
        } finally {
            loading = false;
        }
    }

    function updateSlugFromTitle() {
        if (!draft) return;
        draft.slug = slugify(draft.title);
    }

    async function publish() {
        if (!draft) return;
        publishing = true;
        error = "";
        resultUrl = "";
        try {
            const result = await publisher.publish({
                ...draft,
                tags: splitTags(tagText),
                commitMessage,
                overwrite,
            });
            resultUrl = result.url;
            onPublished(result.url);
        } catch (err) {
            error = getErrorMessage(err);
            showMessage(error, 7000);
        } finally {
            publishing = false;
        }
    }

    function getErrorMessage(err: unknown) {
        return err instanceof Error ? err.message : String(err);
    }
</script>

<div class="astro-paper-panel">
    {#if loading}
        <div class="astro-paper-panel__state">{i18n.loadingDraft}</div>
    {:else if error && !draft}
        <div class="b3-label astro-paper-panel__error">{error}</div>
        <div class="astro-paper-panel__actions">
            <button class="b3-button" on:click={loadDraft}>{i18n.retry}</button>
        </div>
    {:else if draft}
        {#if !isConfigured}
            <div class="b3-label astro-paper-panel__warning">
                {i18n.settingsMissing}
                <button class="b3-button b3-button--outline" on:click={onOpenSettings}>{i18n.openPublisherSettings}</button>
            </div>
        {/if}

        <div class="astro-paper-form">
            <label class="astro-paper-field">
                <span>{i18n.fieldTitle}</span>
                <input class="b3-text-field" bind:value={draft.title} on:change={updateSlugFromTitle} />
            </label>

            <label class="astro-paper-field">
                <span>{i18n.fieldSlug}</span>
                <input class="b3-text-field" bind:value={draft.slug} />
            </label>

            <label class="astro-paper-field">
                <span>{i18n.fieldDescription}</span>
                <textarea class="b3-text-field" rows="3" bind:value={draft.description}></textarea>
            </label>

            <label class="astro-paper-field">
                <span>{i18n.fieldTags}</span>
                <input class="b3-text-field" bind:value={tagText} />
            </label>

            <div class="astro-paper-grid">
                <label class="astro-paper-field">
                    <span>{i18n.fieldAuthor}</span>
                    <input class="b3-text-field" bind:value={draft.author} />
                </label>
                <label class="astro-paper-field">
                    <span>{i18n.fieldPubDatetime}</span>
                    <input class="b3-text-field" bind:value={draft.pubDatetime} />
                </label>
            </div>

            <label class="astro-paper-field">
                <span>{i18n.fieldTimezone}</span>
                <input class="b3-text-field" bind:value={draft.timezone} />
            </label>

            <div class="astro-paper-checks">
                <label>
                    <input class="b3-switch" type="checkbox" bind:checked={draft.draft} />
                    <span>{i18n.fieldDraft}</span>
                </label>
                <label>
                    <input class="b3-switch" type="checkbox" bind:checked={draft.featured} />
                    <span>{i18n.fieldFeatured}</span>
                </label>
                <label>
                    <input class="b3-switch" type="checkbox" bind:checked={overwrite} />
                    <span>{i18n.fieldOverwrite}</span>
                </label>
            </div>

            <label class="astro-paper-field">
                <span>{i18n.fieldCommitMessage}</span>
                <input class="b3-text-field" bind:value={commitMessage} />
            </label>
        </div>

        <div class="astro-paper-summary">
            <div><b>{i18n.targetPath}</b> {markdownPath}</div>
            <div><b>{i18n.assetCount}</b> {settings.includeAssets ? assetCount : 0}</div>
        </div>

        {#if error}
            <div class="b3-label astro-paper-panel__error">{error}</div>
        {/if}

        {#if resultUrl}
            <div class="b3-label astro-paper-panel__success">
                {i18n.publishSuccess}
                <a href={resultUrl} target="_blank" rel="noreferrer">{resultUrl}</a>
            </div>
        {/if}

        <div class="astro-paper-panel__actions">
            <button class="b3-button b3-button--outline" on:click={onOpenSettings}>{i18n.openPublisherSettings}</button>
            <button class="b3-button b3-button--outline" on:click={loadDraft} disabled={publishing}>{i18n.reloadDraft}</button>
            <button class="b3-button" on:click={publish} disabled={publishing || !isConfigured}>
                {publishing ? i18n.publishing : i18n.publish}
            </button>
        </div>
    {/if}
</div>
