import { describe, it, expect } from "vitest";
import { buildDroppedCardText } from "./droppedText";

describe("buildDroppedCardText", () => {
	it("prepends the file title as a markdown heading", () => {
		expect(buildDroppedCardText("Project note", "Body text")).toBe(
			"# Project note\n\nBody text"
		);
	});

	it("keeps frontmatter at the top before adding the title", () => {
		expect(
			buildDroppedCardText("Daily note", "---\ntags: [daily]\n---\nEntry")
		).toBe("---\ntags: [daily]\n---\n\n# Daily note\n\nEntry");
	});

	it("falls back when the title is blank", () => {
		expect(buildDroppedCardText(" ", "Body text")).toBe("# Untitled\n\nBody text");
	});
});
