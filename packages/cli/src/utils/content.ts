/**
 * Content comparison utilities for file overwrite detection.
 */

/**
 * Normalize content for comparison by standardizing line endings and trimming.
 */
function normalizeContent(content: string): string {
	return content.replace(/\r\n/g, "\n").trim()
}

/**
 * Compare file content, normalizing line endings.
 * Returns true if content is identical after normalization.
 */
export function isContentIdentical(existing: string, incoming: string): boolean {
	return normalizeContent(existing) === normalizeContent(incoming)
}
