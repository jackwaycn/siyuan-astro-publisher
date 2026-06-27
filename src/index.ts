import { Dialog, Menu, Plugin, confirm, getAllEditor, getFrontend, showMessage } from "siyuan";
import "./index.scss";

import PublishDialog from "@/publish-dialog.svelte";
import { SettingUtils } from "./libs/setting-utils";
import { AstroPaperGithubPublisher, DEFAULT_SETTINGS, type BlogPublishSettings } from "./publish/astro-paper";

const STORAGE_NAME = "astro-paper-publisher-settings";

export default class AstroPaperPublisherPlugin extends Plugin {
    private isMobile = false;
    private settings: SettingUtils;
    private activeDocId = "";
    private readonly handleSwitchProtyle = (event: CustomEvent<{ protyle: any }>) => {
        this.activeDocId = getRootIdFromProtyle(event.detail?.protyle) || this.activeDocId;
    };

    async onload() {
        this.isMobile = ["mobile", "browser-mobile"].includes(getFrontend());

        this.addIcons(`<symbol id="iconAstroPaperPublish" viewBox="0 0 32 32">
<path d="M18.667 3.2 4.8 18.133c-.853.907-.213 2.4 1.04 2.4h7.2l-1.707 7.707c-.32 1.44 1.493 2.32 2.427 1.173L27.2 12.8c.747-.933.08-2.32-1.12-2.32h-7.413l1.813-5.573c.507-1.547-.707-2.773-1.813-1.707z"></path>
</symbol>`);

        this.settings = new SettingUtils({
            plugin: this,
            name: STORAGE_NAME,
            width: this.isMobile ? "92vw" : "720px",
            callback: (data) => {
                this.data[STORAGE_NAME] = normalizeSettings(data);
            },
        });
        this.buildSettingsPanel();

        try {
            const loaded = await this.settings.load();
            this.data[STORAGE_NAME] = normalizeSettings(loaded ?? this.settings.dump());
        } catch (error) {
            console.warn("Failed to load AstroPaper publisher settings:", error);
            this.data[STORAGE_NAME] = { ...DEFAULT_SETTINGS };
        }

        this.addCommand({
            langKey: "publishCurrentDoc",
            hotkey: "⌥⌘P",
            callback: () => this.openPublishDialog(),
            editorCallback: (protyle) => this.openPublishDialog(getRootIdFromProtyle(protyle)),
        });

        this.addCommand({
            langKey: "openPublisherSettings",
            hotkey: "",
            callback: () => this.openPublisherSettings(),
        });

        this.eventBus.on("switch-protyle", this.handleSwitchProtyle);
    }

    onLayoutReady() {
        const topBar = this.addTopBar({
            icon: "iconAstroPaperPublish",
            title: this.i18n.publishCurrentDoc,
            position: "right",
            callback: () => {
                if (this.isMobile) {
                    this.openPublishDialog();
                    return;
                }
                let rect = topBar.getBoundingClientRect();
                if (rect.width === 0) {
                    rect = document.querySelector("#barMore")?.getBoundingClientRect();
                }
                this.openMenu(rect);
            },
        });
    }

    async onunload() {
        this.eventBus.off("switch-protyle", this.handleSwitchProtyle);
        console.log("AstroPaper GitHub Publisher unloaded");
    }

    private buildSettingsPanel() {
        const saveOnChange = async (key: keyof BlogPublishSettings) => {
            await this.settings.takeAndSave(key);
            this.data[STORAGE_NAME] = normalizeSettings(this.settings.dump());
        };

        this.settings.addItem({
            key: "owner",
            value: DEFAULT_SETTINGS.owner,
            type: "textinput",
            title: this.i18n.settingsOwnerTitle,
            description: this.i18n.settingsOwnerDesc,
            action: { callback: () => void saveOnChange("owner") },
        });
        this.settings.addItem({
            key: "repo",
            value: DEFAULT_SETTINGS.repo,
            type: "textinput",
            title: this.i18n.settingsRepoTitle,
            description: this.i18n.settingsRepoDesc,
            action: { callback: () => void saveOnChange("repo") },
        });
        this.settings.addItem({
            key: "branch",
            value: DEFAULT_SETTINGS.branch,
            type: "textinput",
            title: this.i18n.settingsBranchTitle,
            description: this.i18n.settingsBranchDesc,
            action: { callback: () => void saveOnChange("branch") },
        });
        this.settings.addItem({
            key: "token",
            value: DEFAULT_SETTINGS.token,
            type: "textarea",
            title: this.i18n.settingsTokenTitle,
            description: this.i18n.settingsTokenDesc,
            action: { callback: () => void saveOnChange("token") },
        });
        this.settings.addItem({
            key: "contentDir",
            value: DEFAULT_SETTINGS.contentDir,
            type: "textinput",
            title: this.i18n.settingsContentDirTitle,
            description: this.i18n.settingsContentDirDesc,
            action: { callback: () => void saveOnChange("contentDir") },
        });
        this.settings.addItem({
            key: "assetDir",
            value: DEFAULT_SETTINGS.assetDir,
            type: "textinput",
            title: this.i18n.settingsAssetDirTitle,
            description: this.i18n.settingsAssetDirDesc,
            action: { callback: () => void saveOnChange("assetDir") },
        });
        this.settings.addItem({
            key: "assetUrlPrefix",
            value: DEFAULT_SETTINGS.assetUrlPrefix,
            type: "textinput",
            title: this.i18n.settingsAssetUrlPrefixTitle,
            description: this.i18n.settingsAssetUrlPrefixDesc,
            action: { callback: () => void saveOnChange("assetUrlPrefix") },
        });
        this.settings.addItem({
            key: "author",
            value: DEFAULT_SETTINGS.author,
            type: "textinput",
            title: this.i18n.settingsAuthorTitle,
            description: this.i18n.settingsAuthorDesc,
            action: { callback: () => void saveOnChange("author") },
        });
        this.settings.addItem({
            key: "defaultTags",
            value: DEFAULT_SETTINGS.defaultTags,
            type: "textinput",
            title: this.i18n.settingsDefaultTagsTitle,
            description: this.i18n.settingsDefaultTagsDesc,
            action: { callback: () => void saveOnChange("defaultTags") },
        });
        this.settings.addItem({
            key: "includeAssets",
            value: DEFAULT_SETTINGS.includeAssets,
            type: "checkbox",
            title: this.i18n.settingsIncludeAssetsTitle,
            description: this.i18n.settingsIncludeAssetsDesc,
            action: { callback: () => void saveOnChange("includeAssets") },
        });
    }

    private openMenu(rect?: DOMRect) {
        const menu = new Menu("astroPaperPublisherMenu");
        menu.addItem({
            icon: "iconUpload",
            label: this.i18n.publishCurrentDoc,
            click: () => this.openPublishDialog(),
        });
        menu.addItem({
            icon: "iconSettings",
            label: this.i18n.openPublisherSettings,
            click: () => this.openPublisherSettings(),
        });
        if (this.isMobile) {
            menu.fullscreen();
            return;
        }
        menu.open({
            x: rect?.right ?? window.innerWidth - 48,
            y: rect?.bottom ?? 48,
            isLeft: true,
        });
    }

    private openPublishDialog(docId = this.getCurrentDocId()) {
        if (!docId) {
            showMessage(this.i18n.openDocFirst);
            return;
        }

        const publisher = new AstroPaperGithubPublisher(() => normalizeSettings(this.settings.dump()));

        let component: PublishDialog;
        const dialog = new Dialog({
            title: this.i18n.publishDialogTitle,
            content: `<div id="AstroPaperPublisherDialog" class="astro-paper-publisher-dialog"></div>`,
            width: this.isMobile ? "92vw" : "760px",
            height: this.isMobile ? "80vh" : "680px",
            destroyCallback: () => component?.$destroy(),
        });

        component = new PublishDialog({
            target: dialog.element.querySelector("#AstroPaperPublisherDialog") as HTMLElement,
            props: {
                docId,
                i18n: this.i18n,
                settings: normalizeSettings(this.settings.dump()),
                publisher,
                onOpenSettings: () => this.openPublisherSettings(),
                onPublished: (url: string) => {
                    showMessage(url ? `${this.i18n.publishSuccess}: ${url}` : this.i18n.publishSuccess);
                },
            },
        });
    }

    private openPublisherSettings(): void {
        void this.settings.load();
        this.setting.open(this.name);
    }

    private getCurrentDocId(): string {
        const activeDocId = this.activeDocId || getVisibleProtyleDocId();
        if (activeDocId) return activeDocId;

        const editors = getAllEditor();
        if (editors.length === 0) {
            return "";
        }
        return getRootIdFromProtyle(editors[editors.length - 1]?.protyle);
    }

    uninstall() {
        confirm(this.name, this.i18n.confirmRemoveData, () => {
            void this.removeData(`${STORAGE_NAME}.json`);
        });
    }
}

function normalizeSettings(data: Partial<BlogPublishSettings> = {}): BlogPublishSettings {
    return {
        ...DEFAULT_SETTINGS,
        ...data,
        owner: (data.owner ?? DEFAULT_SETTINGS.owner).trim(),
        repo: (data.repo ?? DEFAULT_SETTINGS.repo).trim(),
        branch: (data.branch ?? DEFAULT_SETTINGS.branch).trim() || DEFAULT_SETTINGS.branch,
        token: (data.token ?? DEFAULT_SETTINGS.token).trim(),
        contentDir: trimSlashes(data.contentDir ?? DEFAULT_SETTINGS.contentDir),
        assetDir: trimSlashes(data.assetDir ?? DEFAULT_SETTINGS.assetDir),
        assetUrlPrefix: (data.assetUrlPrefix ?? DEFAULT_SETTINGS.assetUrlPrefix).trim(),
        author: (data.author ?? DEFAULT_SETTINGS.author).trim(),
        defaultTags: (data.defaultTags ?? DEFAULT_SETTINGS.defaultTags).trim(),
        includeAssets: data.includeAssets ?? DEFAULT_SETTINGS.includeAssets,
    };
}

function trimSlashes(value: string) {
    return value.trim().replace(/^\/+|\/+$/g, "");
}

function getRootIdFromProtyle(protyle: any): string {
    return protyle?.block?.rootID || "";
}

function getVisibleProtyleDocId(): string {
    const protyles = Array.from(document.querySelectorAll<HTMLElement>(".protyle"));
    const visibleProtyle = protyles.find((element) => element.offsetParent !== null);
    const editor = getAllEditor().find((item) => item.protyle?.element === visibleProtyle);
    return getRootIdFromProtyle(editor?.protyle);
}
