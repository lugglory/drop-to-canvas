import { describe, it, expect } from "vitest";
import { estimateCardSize, CardSizeOptions } from "./sizing";

const OPTS: CardSizeOptions = {
	minCardWidth: 250,
	maxCardWidth: 600,
	maxCardHeight: 600,
};

describe("estimateCardSize", () => {
	it("returns positive integer dimensions for normal text", () => {
		const s = estimateCardSize("hello world\nsecond line", OPTS);
		expect(Number.isFinite(s.width)).toBe(true);
		expect(Number.isFinite(s.height)).toBe(true);
		expect(s.width).toBeGreaterThan(0);
		expect(s.height).toBeGreaterThan(0);
		expect(Number.isInteger(s.width)).toBe(true);
		expect(Number.isInteger(s.height)).toBe(true);
	});

	it("clamps an empty string to the minimum size", () => {
		const s = estimateCardSize("", OPTS);
		expect(s.width).toBe(OPTS.minCardWidth);
		expect(s.height).toBe(60);
	});

	it("never goes below the minimum width", () => {
		const s = estimateCardSize("x", OPTS);
		expect(s.width).toBeGreaterThanOrEqual(OPTS.minCardWidth);
	});

	it("never exceeds the maximum width or height", () => {
		const huge = "lorem ipsum dolor sit amet ".repeat(5000);
		const s = estimateCardSize(huge, OPTS);
		expect(s.width).toBeLessThanOrEqual(OPTS.maxCardWidth);
		expect(s.height).toBeLessThanOrEqual(OPTS.maxCardHeight);
	});

	it("grows height for many short lines", () => {
		const few = estimateCardSize("a\nb", OPTS);
		const many = estimateCardSize(Array(40).fill("a").join("\n"), OPTS);
		expect(many.height).toBeGreaterThan(few.height);
	});

	it("grows width with overall content amount (up to max)", () => {
		const small = estimateCardSize("short note", OPTS);
		const big = estimateCardSize("word ".repeat(300), OPTS);
		expect(big.width).toBeGreaterThanOrEqual(small.width);
	});

	it("handles a misconfigured min > max without inverting", () => {
		const bad: CardSizeOptions = {
			minCardWidth: 800,
			maxCardWidth: 300,
			maxCardHeight: 600,
		};
		const s = estimateCardSize("hello", bad);
		// Effective max wins; width must not exceed the larger of the two.
		expect(s.width).toBeLessThanOrEqual(800);
		expect(s.width).toBeGreaterThan(0);
	});

	it("does not crash on unicode / emoji", () => {
		const s = estimateCardSize("안녕하세요 🌟🚀\n한 줄 더", OPTS);
		expect(s.width).toBeGreaterThan(0);
		expect(s.height).toBeGreaterThan(0);
	});
});
