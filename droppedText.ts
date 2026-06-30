export function buildDroppedCardText(title: string, content: string): string {
	const heading = `# ${title.trim() || "Untitled"}`;
	if (content.trim().length === 0) return heading;

	const frontmatter = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)?/);
	if (!frontmatter) return `${heading}\n\n${content}`;

	const metadata = frontmatter[0].trimEnd();
	const body = content.slice(frontmatter[0].length);
	if (body.trim().length === 0) return `${metadata}\n\n${heading}`;
	return `${metadata}\n\n${heading}\n\n${body.trimStart()}`;
}
