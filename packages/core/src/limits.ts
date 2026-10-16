// How long what people write may be.

export const maxPageTitleLength = 500;
export const maxDisplayNameLength = 50;
export const maxCommentLength = 5000;

// Lengths count code points, so an emoji counts once and is never cut in half.
export function lengthOf(text: string): number {
  return Array.from(text).length;
}

export function shorten(text: string, maxLength: number): string {
  return Array.from(text).slice(0, maxLength).join("");
}
