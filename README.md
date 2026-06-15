# AstroPaper GitHub Publisher

[中文版](./README_zh_CN.md)

A SiYuan plugin for publishing the current document to an AstroPaper blog repository on GitHub.

The plugin exports the current document as Markdown, creates AstroPaper-compatible frontmatter, and commits the file through the GitHub Contents API. It defaults to AstroPaper's post directory `src/content/posts`; local images, videos, and audio files are uploaded to `src/content/posts/assets/{slug}/` and referenced as `./assets/{slug}/...` by default.

## Features

- Publish the current SiYuan document as an AstroPaper post.
- Generate `pubDatetime`, `title`, `description`, `tags`, `draft`, `featured`, and related frontmatter.
- Add `modDatetime` automatically when overwriting an existing post.
- Edit title, slug, description, tags, author, published time, and commit message before publishing.
- Overwrite existing Markdown files when needed.
- Try to upload local image, video, and audio assets referenced by Markdown and rewrite links to Astro-accessible paths.
- Use East Asia time by default and write `timezone: "Asia/Shanghai"`.

## Settings

Open the plugin settings and fill in:

- GitHub owner: the user or organization that owns the repository.
- GitHub repo: the blog repository name.
- Branch: the target branch, usually `main`.
- GitHub token: a fine-grained personal access token with repository `Contents: Read and write` permission.
- Post directory: AstroPaper defaults to `src/content/posts`.
- Asset directory: defaults to `src/content/posts/assets/{slug}`; this is where local assets are uploaded in the repository.
- Asset URL prefix: defaults to `./assets/{slug}`; this is what gets written into Markdown.

Asset directory and asset URL prefix support template placeholders:

- `{slug}`: current post slug.
- `{filename}`: asset filename; if omitted, the filename is appended automatically.

To avoid per-post slug folders, use:

```text
Asset directory: src/content/posts/assets
Asset URL prefix: ./assets
```

Assets will then be uploaded to `src/content/posts/assets/image.png` and referenced as `./assets/image.png`.
- Default author: optional; leave empty to let AstroPaper use the site author.
- Default tags: defaults to `others`; AstroPaper needs at least one tag.

The token is stored in SiYuan plugin settings, so use it only on trusted devices.

## Usage

1. Open the document you want to publish in SiYuan.
2. Click the top bar publish button or run “Publish current document to AstroPaper”.
3. Review the frontmatter fields in the dialog.
4. Click Publish.

After publishing, the plugin shows the GitHub file URL. Deployment is handled by your blog repository, for example through GitHub Pages, Vercel, Netlify, or another workflow.

## Document Attribute Overrides

Add these custom attributes to a SiYuan document to override inferred publishing fields:

- `custom-astro-title`
- `custom-astro-description`
- `custom-astro-tags`
- `custom-astro-slug`
- `custom-astro-author`
- `custom-astro-pub-datetime`
- `custom-astro-timezone`
- `custom-astro-draft`
- `custom-astro-featured`

`custom-astro-tags` supports comma, Chinese comma, newline, or `#` separators.

## AstroPaper Compatibility

AstroPaper currently reads posts from `src/content/posts` by default and requires frontmatter containing at least:

- `pubDatetime`
- `title`
- `description`

The plugin also writes `author`, `featured`, `draft`, and `tags`. If your AstroPaper project has customized the content directory or schema, update the plugin settings and adjust frontmatter after publishing if needed.

## Development

```bash
pnpm install
pnpm run dev
pnpm run build
```

This plugin is adapted from the Vite + Svelte SiYuan plugin template.
