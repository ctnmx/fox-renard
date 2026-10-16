// How long what people write may be.

export const maxPageTitleLength = 500;
export const maxDisplayNameLength = 50;
export const maxCommentLength = 5000;

/** How long after posting a Comment its Commenter may attach Photos to it. */
export const photoWindow = 15 * 60 * 1000;

/** How many Photos a Comment holds at most. */
export const maxPhotosPerComment = 4;
/** How large a Photo may be, once the Widget has resized it. */
export const maxPhotoBytes = 1_000_000;

// Lengths count code points, so an emoji counts once and is never cut in half.
export function lengthOf(text: string): number {
  return Array.from(text).length;
}

export function shorten(text: string, maxLength: number): string {
  return Array.from(text).slice(0, maxLength).join("");
}

/** A display name as typed, with its spaces tidied. */
export function tidyDisplayName(displayName: string): string {
  return displayName.normalize("NFC").trim().replace(/\s+/gu, " ");
}

/** A Comment's text as typed, with its line breaks as `\n`. */
export function tidyCommentText(text: string): string {
  return text.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
}
