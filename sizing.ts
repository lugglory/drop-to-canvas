export interface CardSizeOptions {
	minCardWidth: number;
	maxCardWidth: number;
	maxCardHeight: number;
}

export interface CardSize {
	width: number;
	height: number;
}

/**
 * Estimate a card size that fits the text content. Width is chosen from the
 * overall *amount* of content so the card keeps a pleasant aspect ratio
 * (~1.4:1) as it grows, clamped between min and max. Once width hits its max,
 * height keeps growing to fit. Height is then computed from actual line
 * wrapping at the chosen width so content always fits.
 *
 * This is an approximation — Obsidian renders markdown, so exact pixel size
 * isn't knowable without a live DOM measurement (done separately at runtime).
 *
 * Pure and deterministic so it can be unit-tested without Obsidian.
 */
export function estimateCardSize(text: string, opts: CardSizeOptions): CardSize {
	const charWidth = 8; // ~8px per character at the default canvas font
	const lineHeight = 26;
	const hPadding = 24;
	const vPadding = 24;
	const ASPECT = 1.4; // target width / height
	const FILL = 1.3; // breathing room so cards aren't cramped

	// Guard against a misconfigured min > max.
	const maxWidth = Math.max(opts.minCardWidth, opts.maxCardWidth);
	const minWidth = Math.min(opts.minCardWidth, maxWidth);
	const maxHeight = Math.max(60, opts.maxCardHeight);

	const chars = Math.max(1, text.length);

	// Width from total area at the target aspect ratio: area = w * h, w / h = r
	// => w = sqrt(area * r).
	const area = chars * charWidth * lineHeight * FILL;
	let width = Math.round(Math.sqrt(area * ASPECT)) + hPadding;
	width = Math.max(minWidth, Math.min(width, maxWidth));

	// Height: count wrapped lines at the chosen width so content fits.
	const charsPerLine = Math.max(10, Math.floor((width - hPadding) / charWidth));
	let lines = 0;
	for (const raw of text.split("\n")) {
		lines += Math.max(1, Math.ceil(raw.length / charsPerLine));
	}
	let height = lines * lineHeight + vPadding;
	height = Math.max(60, Math.min(height, maxHeight));

	return { width, height };
}
