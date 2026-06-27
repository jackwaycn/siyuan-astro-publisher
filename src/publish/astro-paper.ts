import { exportMdContent, getBlockAttrs, getBlockByID, getFileBlob, setBlockAttrs } from "@/api";

export interface BlogPublishSettings {
    owner: string;
    repo: string;
    branch: string;
    token: string;
    contentDir: string;
    assetDir: string;
    assetUrlPrefix: string;
    author: string;
    defaultTags: string;
    includeAssets: boolean;
}

export interface PublishDraft {
    docId: string;
    title: string;
    description: string;
    slug: string;
    tags: string[];
    author: string;
    pubDatetime: string;
    timezone: string;
    draft: boolean;
    featured: boolean;
    markdown: string;
    assetRefs: AssetReference[];
    published: boolean;
    lastPublishedAt: string;
    lastUrl: string;
    lastMarkdownPath: string;
}

export interface PublishInput extends PublishDraft {
    commitMessage: string;
    overwrite: boolean;
    modDatetime?: string;
}

export interface PublishResult {
    markdownPath: string;
    url: string;
    uploadedAssets: string[];
    lastPublishedAt: string;
}

export interface AssetReference {
    original: string;
    sourcePath: string;
    fileName: string;
}

interface GithubContent {
    sha?: string;
    html_url?: string;
}

export const DEFAULT_SETTINGS: BlogPublishSettings = {
    owner: "",
    repo: "",
    branch: "main",
    token: "",
    contentDir: "src/content/posts",
    assetDir: "src/content/posts/assets/{slug}",
    assetUrlPrefix: "./assets/{slug}",
    author: "",
    defaultTags: "others",
    includeAssets: true,
};

export class AstroPaperGithubPublisher {
    constructor(private readonly getSettings: () => BlogPublishSettings) {}

    async createDraft(docId: string): Promise<PublishDraft> {
        const [doc, exported, attrs] = await Promise.all([
            getBlockByID(docId),
            exportMdContent(docId, { refMode: 3, embedMode: 0, yfm: false }),
            getBlockAttrs(docId).catch(() => ({})),
        ]);

        const docTitle = cleanInlineText(doc?.content || exported?.hPath?.split("/").pop() || "");
        const rawTitle = attrs["custom-astro-title"] || docTitle || "Untitled";
        const title = cleanInlineText(rawTitle);
        const markdown = removeLeadingDocumentTitle(normalizeMarkdown(exported?.content ?? ""), docTitle);
        const description = attrs["custom-astro-description"] || createDescription(markdown, title);
        const settings = this.getSettings();
        const tags = splitTags(attrs["custom-astro-tags"] || settings.defaultTags);
        const slug = slugify(attrs["custom-astro-slug"] || title);

        return {
            docId,
            title,
            description,
            slug,
            tags,
            author: attrs["custom-astro-author"] || settings.author,
            pubDatetime: attrs["custom-astro-pub-datetime"] || formatEast8DateTime(),
            timezone: attrs["custom-astro-timezone"] || "Asia/Shanghai",
            draft: attrs["custom-astro-draft"] === "true",
            featured: attrs["custom-astro-featured"] === "true",
            markdown,
            assetRefs: findAssetReferences(markdown),
            published: attrs["custom-astro-published"] === "true" || Boolean(attrs["custom-astro-last-url"]),
            lastPublishedAt: attrs["custom-astro-last-published-at"] || "",
            lastUrl: attrs["custom-astro-last-url"] || "",
            lastMarkdownPath: attrs["custom-astro-last-markdown-path"] || "",
        };
    }

    async publish(input: PublishInput): Promise<PublishResult> {
        const settings = this.getSettings();
        validateSettings(settings);
        validateInput(input);

        const markdownPath = `${settings.contentDir}/${input.slug}.md`;
        const existingMarkdown = await this.getGithubFile(markdownPath);
        if (existingMarkdown?.sha && !input.overwrite) {
            throw new Error(`GitHub file already exists: ${markdownPath}`);
        }

        const assetMap = await this.uploadAssets(input, settings);
        const body = buildMarkdown(
            {
                ...input,
                modDatetime: existingMarkdown?.sha ? formatEast8DateTime() : undefined,
            },
            assetMap
        );

        const uploadedMarkdown = await this.putGithubFile({
            path: markdownPath,
            content: body,
            message: input.commitMessage || `Publish ${input.title}`,
            overwrite: input.overwrite,
            existing: existingMarkdown,
        });

        const uploadedUrl = uploadedMarkdown.html_url ?? buildGithubFileUrl(settings, markdownPath);
        const lastPublishedAt = formatEast8DateTime();
        await savePublishHistory(input, {
            markdownPath,
            url: uploadedUrl,
            lastPublishedAt,
        });

        return {
            markdownPath,
            url: uploadedUrl,
            uploadedAssets: Array.from(assetMap.values()),
            lastPublishedAt,
        };
    }

    private async uploadAssets(input: PublishInput, settings: BlogPublishSettings): Promise<Map<string, string>> {
        const assetMap = new Map<string, string>();
        if (!settings.includeAssets || input.assetRefs.length === 0) {
            return assetMap;
        }

        for (const asset of input.assetRefs) {
            const blob = await getFileBlob(asset.sourcePath);
            if (!blob) {
                throw new Error(`Cannot read local asset: ${asset.sourcePath}`);
            }
            const targetPath = buildAssetPath(settings.assetDir, input.slug, asset.fileName);
            await this.putGithubFile({
                path: targetPath,
                content: blob,
                message: input.commitMessage || `Publish asset ${asset.fileName}`,
                overwrite: true,
            });
            assetMap.set(asset.original, buildAssetUrl(settings, input.slug, asset.fileName));
        }

        return assetMap;
    }

    private async putGithubFile(options: {
        path: string;
        content: string | Blob;
        message: string;
        overwrite: boolean;
        existing?: GithubContent | null;
    }): Promise<GithubContent> {
        const settings = this.getSettings();
        const path = encodeGithubPath(options.path);
        const existing = options.existing ?? await this.getGithubFile(options.path);
        if (existing?.sha && !options.overwrite) {
            throw new Error(`GitHub file already exists: ${options.path}`);
        }

        const response = await fetch(`https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${path}`, {
            method: "PUT",
            headers: githubHeaders(settings.token),
            body: JSON.stringify({
                message: options.message,
                content: await toBase64(options.content),
                branch: settings.branch,
                ...(existing?.sha ? { sha: existing.sha } : {}),
            }),
        });

        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(json?.message || `GitHub upload failed: ${response.status}`);
        }
        return json?.content ?? {};
    }

    private async getGithubFile(path: string): Promise<GithubContent | null> {
        const settings = this.getSettings();
        const response = await fetch(
            `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${encodeGithubPath(path)}?ref=${encodeURIComponent(settings.branch)}`,
            {
                method: "GET",
                headers: githubHeaders(settings.token),
            }
        );
        if (response.status === 404) {
            return null;
        }
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(json?.message || `GitHub lookup failed: ${response.status}`);
        }
        return json;
    }
}

export function buildMarkdown(input: PublishInput, assetMap: Map<string, string> = new Map()) {
    const markdown = replaceAssetUrls(input.markdown, assetMap);
    const frontmatter = [
        "---",
        `author: ${yamlString(input.author)}`,
        `pubDatetime: ${input.pubDatetime}`,
        ...(input.modDatetime ? [`modDatetime: ${input.modDatetime}`] : []),
        `title: ${yamlString(input.title)}`,
        `featured: ${input.featured ? "true" : "false"}`,
        `draft: ${input.draft ? "true" : "false"}`,
        `tags: ${yamlArray(input.tags)}`,
        `description: ${yamlString(input.description)}`,
        `timezone: ${yamlString(input.timezone || "Asia/Shanghai")}`,
        "---",
        "",
    ];
    return `${frontmatter.join("\n")}${markdown.trim()}\n`;
}

export function splitTags(value: string): string[] {
    return value
        .split(/[,，#\n]/g)
        .map((tag) => tag.trim())
        .filter(Boolean);
}

export function slugify(value: string) {
    const ascii = value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return ascii || `post-${new Date().toISOString().slice(0, 10)}`;
}

function validateSettings(settings: BlogPublishSettings) {
    const missing = [
        ["owner", settings.owner],
        ["repo", settings.repo],
        ["token", settings.token],
        ["contentDir", settings.contentDir],
        ["branch", settings.branch],
    ].filter(([, value]) => !value);
    if (missing.length > 0) {
        throw new Error(`Missing settings: ${missing.map(([key]) => key).join(", ")}`);
    }
}

function validateInput(input: PublishInput) {
    if (!input.title.trim()) throw new Error("Title is required");
    if (!input.description.trim()) throw new Error("Description is required by AstroPaper");
    if (!input.slug.trim()) throw new Error("Slug is required");
    if (input.tags.length === 0) throw new Error("At least one tag is required");
}

async function savePublishHistory(input: PublishInput, result: Pick<PublishResult, "markdownPath" | "url" | "lastPublishedAt">) {
    try {
        await setBlockAttrs(input.docId, {
            "custom-astro-published": "true",
            "custom-astro-title": input.title,
            "custom-astro-description": input.description,
            "custom-astro-tags": input.tags.join(", "),
            "custom-astro-slug": input.slug,
            "custom-astro-author": input.author,
            "custom-astro-pub-datetime": input.pubDatetime,
            "custom-astro-timezone": input.timezone || "Asia/Shanghai",
            "custom-astro-draft": String(input.draft),
            "custom-astro-featured": String(input.featured),
            "custom-astro-last-published-at": result.lastPublishedAt,
            "custom-astro-last-url": result.url,
            "custom-astro-last-markdown-path": result.markdownPath,
        });
    } catch (error) {
        console.warn("Failed to save AstroPaper publish history:", error);
    }
}

function normalizeMarkdown(markdown: string) {
    return markdown
        .replace(/^---[\s\S]*?---\s*/, "")
        .replace(/\n\{:\s+[^}]*id="[^"]+"[^}]*\}/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function removeLeadingDocumentTitle(markdown: string, documentTitle: string) {
    const title = cleanInlineText(documentTitle);
    if (!title || !markdown.trim()) return markdown.trim();

    const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
    const firstLine = lines[0]?.trim() ?? "";
    const atxHeading = firstLine.match(/^#(?!#)\s+(.+?)\s*#*\s*$/);
    if (atxHeading && cleanInlineText(atxHeading[1]) === title) {
        return lines.slice(1).join("\n").replace(/^\n+/, "").trim();
    }

    if (lines.length > 1 && cleanInlineText(firstLine) === title && /^=+\s*$/.test(lines[1].trim())) {
        return lines.slice(2).join("\n").replace(/^\n+/, "").trim();
    }

    return markdown.trim();
}

function createDescription(markdown: string, fallback: string) {
    const paragraph = markdown
        .replace(/!\[[^\]]*]\([^)]+\)/g, "")
        .split(/\n{2,}/)
        .map(cleanInlineText)
        .find((line) => line.length > 0 && !line.startsWith("#"));
    return (paragraph || fallback).slice(0, 180);
}

function cleanInlineText(value: string) {
    return value
        .replace(/^#+\s*/, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
        .replace(/\{:\s+[^}]+\}/g, "")
        .trim();
}

function findAssetReferences(markdown: string): AssetReference[] {
    const refs = new Map<string, AssetReference>();
    const addReference = (original: string, requireAssetExtension = false) => {
        if (!original || isRemoteUrl(original) || refs.has(original)) return;
        if (requireAssetExtension && !isLocalAssetLink(original)) return;
        const sourcePath = normalizeAssetPath(safeDecodeURIComponent(original));
        if (!sourcePath) return;
        refs.set(original, {
            original,
            sourcePath,
            fileName: uniqueFileName(sourcePath, refs.size),
        });
    };

    const markdownPattern = /(!?)\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let match: RegExpExecArray | null;
    while ((match = markdownPattern.exec(markdown)) !== null) {
        addReference(match[2], match[1] !== "!");
    }

    const htmlMediaPattern = /<(img|video|audio|source|track)\b[^>]*>/gi;
    const htmlAssetAttrPattern = /\b(?:src|poster)=["']([^"']+)["']/gi;
    while ((match = htmlMediaPattern.exec(markdown)) !== null) {
        const tag = match[0];
        let attrMatch: RegExpExecArray | null;
        htmlAssetAttrPattern.lastIndex = 0;
        while ((attrMatch = htmlAssetAttrPattern.exec(tag)) !== null) {
            addReference(attrMatch[1]);
        }
    }
    return Array.from(refs.values());
}

function normalizeAssetPath(path: string) {
    const clean = path.split("#")[0].split("?")[0].replace(/^\.?\//, "");
    if (!clean) return "";
    if (clean.startsWith("assets/")) return clean;
    if (clean.startsWith("/assets/")) return clean.slice(1);
    if (clean.startsWith("data/")) return clean;
    return clean;
}

function isLocalAssetLink(value: string) {
    const clean = normalizeAssetPath(safeDecodeURIComponent(value)).toLowerCase();
    if (clean.startsWith("assets/") || clean.startsWith("data/assets/")) return true;
    return /\.(avif|bmp|gif|jpe?g|png|svg|webp|ico|mp4|m4v|mov|webm|ogv|avi|mkv|wmv|flv|3gp|mp3|m4a|aac|wav|ogg|oga|flac|opus)$/i.test(clean);
}

function safeDecodeURIComponent(value: string) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function replaceAssetUrls(markdown: string, assetMap: Map<string, string>) {
    let result = markdown;
    for (const [from, to] of assetMap) {
        result = result.split(from).join(to);
    }
    return result;
}

function isRemoteUrl(value: string) {
    return /^(https?:|data:|mailto:|#)/i.test(value);
}

function uniqueFileName(path: string, index: number) {
    const fallback = `asset-${index + 1}`;
    const rawName = path.split("/").pop() || fallback;
    const safeName = rawName.replace(/[^\w.\-\u4e00-\u9fa5]+/g, "-");
    return safeName || fallback;
}

function yamlArray(values: string[]) {
    return `[${values.map(yamlString).join(", ")}]`;
}

function yamlString(value: string) {
    return JSON.stringify(value ?? "");
}

function trimSlashes(value: string) {
    return value.replace(/^\/+|\/+$/g, "");
}

function buildAssetPath(template: string, slug: string, fileName: string) {
    return trimSlashes(renderAssetTemplate(template, slug, fileName));
}

function buildAssetUrl(settings: BlogPublishSettings, slug: string, fileName: string) {
    const prefix = settings.assetUrlPrefix.trim();
    if (prefix) {
        return renderAssetTemplate(prefix, slug, fileName);
    }
    return `/${buildAssetPath(settings.assetDir.replace(/^public\//, ""), slug, fileName)}`;
}

function renderAssetTemplate(template: string, slug: string, fileName: string) {
    const rendered = template
        .replace(/\{slug\}/g, slug)
        .replace(/\{filename\}/g, fileName)
        .replace(/\{fileName\}/g, fileName);
    if (/\{filename\}|\{fileName\}/.test(template)) {
        return rendered;
    }
    return `${rendered.replace(/\/+$/g, "")}/${fileName}`;
}

function buildGithubFileUrl(settings: BlogPublishSettings, path: string) {
    return `https://github.com/${settings.owner}/${settings.repo}/blob/${settings.branch}/${path}`;
}

function formatEast8DateTime(date = new Date()) {
    const east8 = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const yyyy = east8.getUTCFullYear();
    const mm = pad(east8.getUTCMonth() + 1);
    const dd = pad(east8.getUTCDate());
    const hh = pad(east8.getUTCHours());
    const mi = pad(east8.getUTCMinutes());
    const ss = pad(east8.getUTCSeconds());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+08:00`;
}

function pad(value: number) {
    return value.toString().padStart(2, "0");
}

function encodeGithubPath(path: string) {
    return trimSlashes(path)
        .split("/")
        .map(encodeURIComponent)
        .join("/");
}

function githubHeaders(token: string) {
    return {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
    };
}

async function toBase64(content: string | Blob) {
    if (typeof content === "string") {
        return bytesToBase64(new TextEncoder().encode(content));
    }
    return bytesToBase64(new Uint8Array(await content.arrayBuffer()));
}

function bytesToBase64(bytes: Uint8Array) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}
