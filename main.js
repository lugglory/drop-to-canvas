var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => DropToCanvasPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// droppedText.ts
function buildDroppedCardText(title, content) {
  const heading = `# ${title.trim() || "Untitled"}`;
  if (content.trim().length === 0)
    return heading;
  const frontmatter = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)?/);
  if (!frontmatter)
    return `${heading}

${content}`;
  const metadata = frontmatter[0].trimEnd();
  const body = content.slice(frontmatter[0].length);
  if (body.trim().length === 0)
    return `${metadata}

${heading}`;
  return `${metadata}

${heading}

${body.trimStart()}`;
}

// sizing.ts
function estimateCardSize(text, opts) {
  const charWidth = 8;
  const lineHeight = 26;
  const hPadding = 24;
  const vPadding = 24;
  const ASPECT = 1.4;
  const FILL = 1.3;
  const maxWidth = Math.max(opts.minCardWidth, opts.maxCardWidth);
  const minWidth = Math.min(opts.minCardWidth, maxWidth);
  const maxHeight = Math.max(60, opts.maxCardHeight);
  const chars = Math.max(1, text.length);
  const area = chars * charWidth * lineHeight * FILL;
  let width = Math.round(Math.sqrt(area * ASPECT)) + hPadding;
  width = Math.max(minWidth, Math.min(width, maxWidth));
  const charsPerLine = Math.max(10, Math.floor((width - hPadding) / charWidth));
  let lines = 0;
  for (const raw of text.split("\n")) {
    lines += Math.max(1, Math.ceil(raw.length / charsPerLine));
  }
  let height = lines * lineHeight + vPadding;
  height = Math.max(60, Math.min(height, maxHeight));
  return { width, height };
}

// main.ts
var DEFAULT_SETTINGS = {
  moveOnDrop: true,
  deleteOriginal: true,
  minCardWidth: 250,
  maxCardWidth: 1e3,
  maxCardHeight: 6e3,
  zoomToFitEnabled: true,
  zoomToFitKey: "`"
};
var DropToCanvasPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.hookedWrappers = /* @__PURE__ */ new WeakSet();
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new DropToCanvasSettingTab(this.app, this));
    this.registerEvent(
      this.app.workspace.on(
        "active-leaf-change",
        (leaf) => this.tryHookCanvas(leaf)
      )
    );
    this.app.workspace.onLayoutReady(
      () => {
        var _a;
        return this.tryHookCanvas((_a = this.app.workspace.activeLeaf) != null ? _a : null);
      }
    );
    this.addCommand({
      id: "toggle-move-on-drop",
      name: "Toggle: move file content into card on drop",
      callback: async () => {
        this.settings.moveOnDrop = !this.settings.moveOnDrop;
        await this.saveSettings();
        new import_obsidian.Notice(
          `Drop to Canvas: move-on-drop ${this.settings.moveOnDrop ? "ON" : "OFF"}`
        );
      }
    });
  }
  tryHookCanvas(leaf) {
    var _a, _b;
    if (!leaf)
      return;
    const view = leaf.view;
    if (!view || ((_b = (_a = leaf.view).getViewType) == null ? void 0 : _b.call(_a)) !== "canvas")
      return;
    const canvas = view.canvas;
    if (!(canvas == null ? void 0 : canvas.wrapperEl))
      return;
    if (this.hookedWrappers.has(canvas.wrapperEl))
      return;
    this.hookedWrappers.add(canvas.wrapperEl);
    const wrapper = canvas.wrapperEl;
    this.registerDomEvent(
      wrapper,
      "drop",
      (evt) => this.onDropToCanvas(evt, canvas),
      { capture: true }
    );
    this.registerDomEvent(
      wrapper,
      "keydown",
      (evt) => this.onCanvasKeydown(evt, canvas)
    );
  }
  onCanvasKeydown(evt, canvas) {
    if (!this.settings.zoomToFitEnabled)
      return;
    if (evt.key !== this.settings.zoomToFitKey)
      return;
    if (evt.ctrlKey || evt.metaKey || evt.altKey)
      return;
    if (this.isEditingField())
      return;
    if (typeof canvas.zoomToFit === "function") {
      evt.preventDefault();
      canvas.zoomToFit();
    }
  }
  /** True when focus is in a text input, textarea, or editable element. */
  isEditingField() {
    const el = document.activeElement;
    if (!el)
      return false;
    if (el.isContentEditable)
      return true;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }
  async onDropToCanvas(evt, canvas) {
    if (!this.settings.moveOnDrop)
      return;
    const files = this.getDraggedFiles(evt);
    if (files.length === 0)
      return;
    const textFiles = files.filter((f) => this.isTextFile(f));
    if (textFiles.length === 0)
      return;
    evt.preventDefault();
    evt.stopImmediatePropagation();
    const basePos = this.posFromEvt(canvas, evt);
    let offset = 0;
    for (const file of textFiles) {
      try {
        const content = await this.app.vault.read(file);
        if (content.trim().length === 0) {
          new import_obsidian.Notice(`Drop to Canvas: ${file.name} is empty \u2014 skipped`);
          continue;
        }
        const text = buildDroppedCardText(file.basename, content);
        const size = estimateCardSize(text, this.settings);
        const node = canvas.createTextNode({
          pos: { x: basePos.x + offset, y: basePos.y + offset },
          size,
          text,
          focus: false,
          save: true
        });
        this.fitNodeHeight(canvas, node, size.width);
        offset += 24;
        if (this.settings.deleteOriginal) {
          await this.app.fileManager.trashFile(file);
        }
      } catch (e) {
        console.error("Drop to Canvas: failed to move file", file.path, e);
        new import_obsidian.Notice(`Drop to Canvas: failed to move ${file.name}`);
      }
    }
    canvas.requestSave();
  }
  /** Pull the dragged TFile(s) from Obsidian's internal drag manager. */
  getDraggedFiles(evt) {
    const dm = this.app.dragManager;
    const draggable = dm == null ? void 0 : dm.draggable;
    const out = [];
    if (!draggable)
      return out;
    if (draggable.file instanceof import_obsidian.TFile)
      out.push(draggable.file);
    if (Array.isArray(draggable.files)) {
      for (const f of draggable.files) {
        if (f instanceof import_obsidian.TFile && !out.includes(f))
          out.push(f);
      }
    }
    return out;
  }
  isTextFile(file) {
    const ext = file.extension.toLowerCase();
    return ["md", "txt", "csv", "json"].includes(ext);
  }
  posFromEvt(canvas, evt) {
    var _a;
    if (typeof canvas.posFromEvt === "function") {
      return canvas.posFromEvt(evt);
    }
    const rect = canvas.wrapperEl.getBoundingClientRect();
    const zoom = (_a = canvas.zoom) != null ? _a : 1;
    return {
      x: canvas.x + (evt.clientX - rect.left) / zoom,
      y: canvas.y + (evt.clientY - rect.top) / zoom
    };
  }
  /**
   * After a node is rendered, measure the real pixel height of its content at
   * the chosen width and resize the node to fit (clamped to max). Runs after
   * two animation frames so Obsidian has rendered the markdown first.
   * Depends on canvas node internals, so it's all best-effort.
   */
  fitNodeHeight(canvas, node, width) {
    if (!node)
      return;
    const measure = () => {
      var _a;
      try {
        const root = (_a = node.contentEl) != null ? _a : node.nodeEl;
        if (!root)
          return;
        let inner = null;
        for (const sel of [
          ".markdown-rendered",
          ".markdown-preview-sizer",
          ".canvas-node-content"
        ]) {
          inner = root.querySelector(sel);
          if (inner)
            break;
        }
        const measured = (inner != null ? inner : root).scrollHeight;
        if (!measured)
          return;
        const height = Math.max(
          60,
          Math.min(measured + 16, this.settings.maxCardHeight)
        );
        this.applyNodeSize(node, width, height);
        canvas.requestSave();
      } catch (e) {
        console.error("Drop to Canvas: height fit failed", e);
      }
    };
    window.requestAnimationFrame(
      () => window.requestAnimationFrame(measure)
    );
  }
  applyNodeSize(node, width, height) {
    var _a, _b;
    if (typeof node.moveAndResize === "function") {
      node.moveAndResize({ x: node.x, y: node.y, width, height });
    } else if (typeof node.resize === "function") {
      node.resize({ width, height });
      (_a = node.render) == null ? void 0 : _a.call(node);
    } else {
      node.width = width;
      node.height = height;
      (_b = node.render) == null ? void 0 : _b.call(node);
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var DropToCanvasSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Move content into card on drop").setDesc(
      "When you drag a text file onto a canvas, copy its content into a new card instead of creating a file link."
    ).addToggle(
      (t) => t.setValue(this.plugin.settings.moveOnDrop).onChange(async (v) => {
        this.plugin.settings.moveOnDrop = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Delete original file").setDesc(
      "After moving content into the card, send the original file to trash."
    ).addToggle(
      (t) => t.setValue(this.plugin.settings.deleteOriginal).onChange(async (v) => {
        this.plugin.settings.deleteOriginal = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Min card width").setDesc("Cards never get narrower than this.").addText(
      (txt) => txt.setValue(String(this.plugin.settings.minCardWidth)).onChange(async (v) => {
        const n = Number(v);
        if (!Number.isNaN(n) && n > 0) {
          this.plugin.settings.minCardWidth = n;
          await this.plugin.saveSettings();
        }
      })
    );
    new import_obsidian.Setting(containerEl).setName("Max card width").setDesc("Width grows with content up to this, then text wraps.").addText(
      (txt) => txt.setValue(String(this.plugin.settings.maxCardWidth)).onChange(async (v) => {
        const n = Number(v);
        if (!Number.isNaN(n) && n > 0) {
          this.plugin.settings.maxCardWidth = n;
          await this.plugin.saveSettings();
        }
      })
    );
    new import_obsidian.Setting(containerEl).setName("Max card height").setDesc("Cards taller than this are capped (content scrolls).").addText(
      (txt) => txt.setValue(String(this.plugin.settings.maxCardHeight)).onChange(async (v) => {
        const n = Number(v);
        if (!Number.isNaN(n) && n > 0) {
          this.plugin.settings.maxCardHeight = n;
          await this.plugin.saveSettings();
        }
      })
    );
    new import_obsidian.Setting(containerEl).setName("Shortcuts").setHeading();
    new import_obsidian.Setting(containerEl).setName("Zoom-to-fit key").setDesc(
      "Press this key, while the canvas is focused and you are not editing a node, to fit all nodes in view (like Shift+1)."
    ).addToggle(
      (t) => t.setValue(this.plugin.settings.zoomToFitEnabled).onChange(async (v) => {
        this.plugin.settings.zoomToFitEnabled = v;
        await this.plugin.saveSettings();
      })
    ).addText(
      (txt) => txt.setPlaceholder("`").setValue(this.plugin.settings.zoomToFitKey).onChange(async (v) => {
        const key = v.length > 0 ? v[0] : this.plugin.settings.zoomToFitKey;
        this.plugin.settings.zoomToFitKey = key;
        await this.plugin.saveSettings();
      })
    );
  }
};
