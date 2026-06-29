import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import { estimateCardSize } from "./sizing";

/**
 * Obsidian's Canvas internals are not part of the public API, so we describe
 * just the bits we touch here. These may break on Obsidian updates.
 */
interface CanvasNode {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	nodeEl?: HTMLElement;
	contentEl?: HTMLElement;
	/** Recent versions: apply a new bounding box. */
	moveAndResize?(bbox: {
		x: number;
		y: number;
		width: number;
		height: number;
	}): void;
	resize?(size: { width: number; height: number }): void;
	render?(): void;
}
interface CanvasView {
	canvas: Canvas;
}
interface Canvas {
	wrapperEl: HTMLElement;
	createTextNode(opts: {
		pos: { x: number; y: number };
		size?: { width: number; height: number };
		text: string;
		focus?: boolean;
		save?: boolean;
	}): CanvasNode;
	requestSave(): void;
	/** Zoom/pan so every node fits in the viewport (same as Shift+1). */
	zoomToFit?(): void;
	/** Present in recent versions: converts a DOM event to canvas coords. */
	posFromEvt?(evt: MouseEvent): { x: number; y: number };
	x: number;
	y: number;
	zoom: number;
}

interface DropToCanvasSettings {
	moveOnDrop: boolean;
	deleteOriginal: boolean;
	minCardWidth: number;
	maxCardWidth: number;
	maxCardHeight: number;
	zoomToFitEnabled: boolean;
	zoomToFitKey: string;
}

const DEFAULT_SETTINGS: DropToCanvasSettings = {
	moveOnDrop: true,
	deleteOriginal: true,
	minCardWidth: 250,
	maxCardWidth: 1000,
	maxCardHeight: 6000,
	zoomToFitEnabled: true,
	zoomToFitKey: "`",
};

export default class DropToCanvasPlugin extends Plugin {
	settings: DropToCanvasSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new DropToCanvasSettingTab(this.app, this));

		// Attach our drop handler to any canvas leaf as it becomes active.
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) =>
				this.tryHookCanvas(leaf)
			)
		);
		this.app.workspace.onLayoutReady(() =>
			this.tryHookCanvas(this.app.workspace.activeLeaf ?? null)
		);

		this.addCommand({
			id: "toggle-move-on-drop",
			name: "Toggle: move file content into card on drop",
			callback: async () => {
				this.settings.moveOnDrop = !this.settings.moveOnDrop;
				await this.saveSettings();
				new Notice(
					`Drop to Canvas: move-on-drop ${
						this.settings.moveOnDrop ? "ON" : "OFF"
					}`
				);
			},
		});
	}

	private hookedWrappers = new WeakSet<HTMLElement>();

	private tryHookCanvas(leaf: WorkspaceLeaf | null) {
		if (!leaf) return;
		const view = leaf.view as unknown as CanvasView;
		if (!view || (leaf.view as any).getViewType?.() !== "canvas") return;
		const canvas = view.canvas;
		if (!canvas?.wrapperEl) return;
		if (this.hookedWrappers.has(canvas.wrapperEl)) return;
		this.hookedWrappers.add(canvas.wrapperEl);

		const wrapper = canvas.wrapperEl;

		// Capture phase so we run before Obsidian's own canvas drop handler.
		this.registerDomEvent(
			wrapper,
			"drop",
			(evt: DragEvent) => this.onDropToCanvas(evt, canvas),
			{ capture: true }
		);

		// Single-key shortcuts that only apply while the canvas is focused.
		this.registerDomEvent(wrapper, "keydown", (evt: KeyboardEvent) =>
			this.onCanvasKeydown(evt, canvas)
		);
	}

	private onCanvasKeydown(evt: KeyboardEvent, canvas: Canvas) {
		if (!this.settings.zoomToFitEnabled) return;
		if (evt.key !== this.settings.zoomToFitKey) return;
		// Bare key only — let modifier combos through (e.g. Ctrl+`).
		if (evt.ctrlKey || evt.metaKey || evt.altKey) return;
		// Not while editing a node / typing in any field.
		if (this.isEditingField()) return;

		if (typeof canvas.zoomToFit === "function") {
			evt.preventDefault();
			canvas.zoomToFit();
		}
	}

	/** True when focus is in a text input, textarea, or editable element. */
	private isEditingField(): boolean {
		const el = document.activeElement as HTMLElement | null;
		if (!el) return false;
		if (el.isContentEditable) return true;
		const tag = el.tagName;
		return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
	}

	private async onDropToCanvas(evt: DragEvent, canvas: Canvas) {
		if (!this.settings.moveOnDrop) return;

		const files = this.getDraggedFiles(evt);
		if (files.length === 0) return; // not an internal file drag; let Obsidian handle it

		// Only intercept text-bearing files; binary files fall through to default.
		const textFiles = files.filter((f) => this.isTextFile(f));
		if (textFiles.length === 0) return;

		evt.preventDefault();
		// stopImmediatePropagation (not just stopPropagation) so Obsidian's own
		// drop handler can't run even if it's registered on this same element.
		evt.stopImmediatePropagation();

		const basePos = this.posFromEvt(canvas, evt);
		let offset = 0;

		for (const file of textFiles) {
			try {
				const content = await this.app.vault.read(file);
				// Don't trash a note just to create an empty card.
				if (content.trim().length === 0) {
					new Notice(`Drop to Canvas: ${file.name} is empty — skipped`);
					continue;
				}
				const size = estimateCardSize(content, this.settings);
				const node = canvas.createTextNode({
					pos: { x: basePos.x + offset, y: basePos.y + offset },
					size,
					text: content,
					focus: false,
					save: true,
				});
				// Width is good from the estimate; refine height by measuring the
				// actually-rendered content at that width.
				this.fitNodeHeight(canvas, node, size.width);
				offset += 24;

				if (this.settings.deleteOriginal) {
					await this.app.fileManager.trashFile(file);
				}
			} catch (e) {
				console.error("Drop to Canvas: failed to move file", file.path, e);
				new Notice(`Drop to Canvas: failed to move ${file.name}`);
			}
		}

		canvas.requestSave();
	}

	/** Pull the dragged TFile(s) from Obsidian's internal drag manager. */
	private getDraggedFiles(evt: DragEvent): TFile[] {
		const dm = (this.app as any).dragManager;
		const draggable = dm?.draggable;
		const out: TFile[] = [];
		if (!draggable) return out;
		if (draggable.file instanceof TFile) out.push(draggable.file);
		if (Array.isArray(draggable.files)) {
			for (const f of draggable.files) {
				if (f instanceof TFile && !out.includes(f)) out.push(f);
			}
		}
		return out;
	}

	private isTextFile(file: TFile): boolean {
		const ext = file.extension.toLowerCase();
		// Note: ".canvas" is intentionally excluded — dropping a canvas should
		// not dump its JSON into a card and trash the original.
		return ["md", "txt", "csv", "json"].includes(ext);
	}

	private posFromEvt(canvas: Canvas, evt: MouseEvent): { x: number; y: number } {
		if (typeof canvas.posFromEvt === "function") {
			return canvas.posFromEvt(evt);
		}
		// Fallback: convert client coords to canvas coords manually.
		const rect = canvas.wrapperEl.getBoundingClientRect();
		const zoom = canvas.zoom ?? 1;
		return {
			x: canvas.x + (evt.clientX - rect.left) / zoom,
			y: canvas.y + (evt.clientY - rect.top) / zoom,
		};
	}

	/**
	 * After a node is rendered, measure the real pixel height of its content at
	 * the chosen width and resize the node to fit (clamped to max). Runs after
	 * two animation frames so Obsidian has rendered the markdown first.
	 * Depends on canvas node internals, so it's all best-effort.
	 */
	private fitNodeHeight(canvas: Canvas, node: CanvasNode, width: number) {
		if (!node) return;
		const measure = () => {
			try {
				const root = node.contentEl ?? node.nodeEl;
				if (!root) return;
				// Prefer the rendered markdown body, in priority order — a comma
				// selector would instead return whichever matches first in DOM
				// order (usually an outer container), not our preference.
				let inner: HTMLElement | null = null;
				for (const sel of [
					".markdown-rendered",
					".markdown-preview-sizer",
					".canvas-node-content",
				]) {
					inner = root.querySelector(sel) as HTMLElement | null;
					if (inner) break;
				}
				const measured = (inner ?? root).scrollHeight;
				if (!measured) return;

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
		window.requestAnimationFrame(() =>
			window.requestAnimationFrame(measure)
		);
	}

	private applyNodeSize(node: CanvasNode, width: number, height: number) {
		if (typeof node.moveAndResize === "function") {
			node.moveAndResize({ x: node.x, y: node.y, width, height });
		} else if (typeof node.resize === "function") {
			node.resize({ width, height });
			node.render?.();
		} else {
			node.width = width;
			node.height = height;
			node.render?.();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class DropToCanvasSettingTab extends PluginSettingTab {
	plugin: DropToCanvasPlugin;

	constructor(app: App, plugin: DropToCanvasPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Move content into card on drop")
			.setDesc(
				"When you drag a text file onto a canvas, copy its content into a new card instead of creating a file link."
			)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.moveOnDrop).onChange(async (v) => {
					this.plugin.settings.moveOnDrop = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Delete original file")
			.setDesc(
				"After moving content into the card, send the original file to trash."
			)
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.deleteOriginal)
					.onChange(async (v) => {
						this.plugin.settings.deleteOriginal = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Min card width")
			.setDesc("Cards never get narrower than this.")
			.addText((txt) =>
				txt
					.setValue(String(this.plugin.settings.minCardWidth))
					.onChange(async (v) => {
						const n = Number(v);
						if (!Number.isNaN(n) && n > 0) {
							this.plugin.settings.minCardWidth = n;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Max card width")
			.setDesc("Width grows with content up to this, then text wraps.")
			.addText((txt) =>
				txt
					.setValue(String(this.plugin.settings.maxCardWidth))
					.onChange(async (v) => {
						const n = Number(v);
						if (!Number.isNaN(n) && n > 0) {
							this.plugin.settings.maxCardWidth = n;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Max card height")
			.setDesc("Cards taller than this are capped (content scrolls).")
			.addText((txt) =>
				txt
					.setValue(String(this.plugin.settings.maxCardHeight))
					.onChange(async (v) => {
						const n = Number(v);
						if (!Number.isNaN(n) && n > 0) {
							this.plugin.settings.maxCardHeight = n;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl).setName("Shortcuts").setHeading();

		new Setting(containerEl)
			.setName("Zoom-to-fit key")
			.setDesc(
				"Press this key, while the canvas is focused and you are not editing a node, to fit all nodes in view (like Shift+1)."
			)
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.zoomToFitEnabled)
					.onChange(async (v) => {
						this.plugin.settings.zoomToFitEnabled = v;
						await this.plugin.saveSettings();
					})
			)
			.addText((txt) =>
				txt
					.setPlaceholder("`")
					.setValue(this.plugin.settings.zoomToFitKey)
					.onChange(async (v) => {
						// Take the first character only; ignore empty input.
						const key = v.length > 0 ? v[0] : this.plugin.settings.zoomToFitKey;
						this.plugin.settings.zoomToFitKey = key;
						await this.plugin.saveSettings();
					})
			);
	}
}
