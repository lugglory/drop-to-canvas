# Drop to Canvas

An Obsidian plugin that changes how dropping a file onto a **Canvas** behaves.

Normally, dragging a note onto a canvas creates a *link card* pointing at the file.
Drop to Canvas instead **moves the file's content into a text card** and **sends the
original file to trash** — and sizes the card to fit its content.

> Personal-use plugin. Not published to the community store.

## Features

- **Drop to move** — drag a text file (`md`, `txt`, `csv`, `json`) onto a
  canvas and its title plus content become a text card; the original is trashed.
- **Auto-size cards** — width is chosen from the amount of content to keep a pleasant
  ratio (clamped between a min and max), then the height is measured from the actual
  rendered content so the card fits.
- **Zoom-to-fit key** — press a single key (default `` ` ``) while the canvas is
  focused and you're *not* editing a node to fit all nodes in view (like Shift+1).
- **Toggle command** — "Toggle: move file content into card on drop".
- Settings for: move-on-drop, delete-original, min/max card width, max card height.

## How it works / caveats

This plugin relies on Obsidian's **undocumented Canvas internals**
(`canvas.createTextNode`, `app.dragManager`, node `moveAndResize`, etc.) plus a
capture-phase `drop` listener to run before Obsidian's default handling. These
internals can change between Obsidian versions; the code is defensive (try/catch +
fallbacks) so a break degrades gracefully rather than crashing.

The original file is moved to trash (per your vault's trash settings), not
permanently deleted.

## Develop

```bash
npm install
npm run dev      # watch build
npm run build    # type-check + production build → main.js
npm test         # run unit tests (sizing logic)
```

`main.js` is built into this folder and committed alongside `manifest.json`.

### Install into a vault

Easiest across machines: install via [BRAT](https://github.com/TfTHacker/obsidian42-brat)
— "Add a beta plugin for testing" → `lugglory/drop-to-canvas`.

Or manually: copy `main.js` and `manifest.json` into
`<your-vault>/.obsidian/plugins/drop-to-canvas/`, then enable the plugin in
Obsidian's community-plugins settings.

## License

MIT
