# AstroPaper GitHub 发布器

[English](./README.md)

这是一个思源笔记插件，用来把当前打开的文档发布到 GitHub 上的 AstroPaper 博客仓库。

插件会导出当前文档 Markdown，生成 AstroPaper 兼容的 frontmatter，并通过 GitHub Contents API 提交到仓库。默认适配 AstroPaper 的文章目录 `src/content/posts`，本地图片会尝试从思源资源路径读取后上传到 `src/content/posts/assets/{slug}/`，Markdown 中默认写入相对路径 `./assets/{slug}/...`。

## 功能

- 发布当前思源文档为 AstroPaper 文章。
- 自动生成 `pubDatetime`、`title`、`description`、`tags`、`draft`、`featured` 等 frontmatter。
- 同名文章覆盖发布时自动写入 `modDatetime`。
- 支持发布前编辑标题、slug、描述、标签、作者、发布时间和提交信息。
- 支持覆盖同名 Markdown 文件。
- 尝试上传 Markdown 中引用的本地图片资源，并把链接改写为 Astro 可访问路径。
- 默认使用东八区时间，并写入 `timezone: "Asia/Shanghai"`。

## 配置

打开插件设置，填写：

- GitHub Owner：仓库所属用户或组织。
- GitHub Repo：博客仓库名。
- Branch：提交分支，通常是 `main`。
- GitHub Token：需要仓库 `Contents: Read and write` 权限的 fine-grained personal access token。
- 文章目录：AstroPaper 默认是 `src/content/posts`。
- 资源目录：默认 `src/content/posts/assets/{slug}`，表示图片上传到仓库中的位置。
- 资源引用路径前缀：默认 `./assets/{slug}`，表示 Markdown 中图片链接怎么写，不是思源本地资源路径。

资源目录和资源引用路径都支持模板占位符：

- `{slug}`：当前文章 slug。
- `{filename}`：资源文件名；不写时会自动追加到模板末尾。

如果不想按文章 slug 分目录，可以把配置改成：

```text
资源目录：src/content/posts/assets
资源引用路径前缀：./assets
```

这样图片会上传到 `src/content/posts/assets/image.png`，文章中引用为 `./assets/image.png`。
- 默认作者：可留空，让 AstroPaper 使用站点作者。
- 默认标签：默认 `others`，AstroPaper 至少需要一个标签。

注意：Token 会保存在思源插件配置文件中，请只在可信设备上使用。

## 使用

1. 在思源中打开要发布的文档。
2. 点击顶部栏的发布按钮，或执行命令“发布当前文档到 AstroPaper”。
3. 在弹窗中检查 frontmatter 字段。
4. 点击“发布”。

发布成功后，插件会返回 GitHub 文件链接。仓库如果已配置 GitHub Pages、Vercel、Netlify 或其他部署流程，后续构建由你的博客仓库负责。

## 文档属性覆盖

可以在思源文档属性中添加以下自定义属性，用来覆盖自动推断的发布信息：

- `custom-astro-title`
- `custom-astro-description`
- `custom-astro-tags`
- `custom-astro-slug`
- `custom-astro-author`
- `custom-astro-pub-datetime`
- `custom-astro-timezone`
- `custom-astro-draft`
- `custom-astro-featured`

其中 `custom-astro-tags` 支持逗号、中文逗号、换行或 `#` 分隔。

## AstroPaper 兼容性

AstroPaper 当前文章集合默认读取 `src/content/posts`，并要求文章 frontmatter 至少包含：

- `pubDatetime`
- `title`
- `description`

插件会同时写入 `author`、`featured`、`draft` 和 `tags`。如果你的 AstroPaper 项目改过内容目录或 schema，请在插件设置里同步修改文章目录，必要时发布后手动调整 frontmatter。

## 开发

```bash
pnpm install
pnpm run dev
pnpm run build
```

本插件基于 Vite + Svelte 的思源插件模板改造。
