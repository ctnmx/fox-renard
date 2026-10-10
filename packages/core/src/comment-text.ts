/**
 * One stretch of a Comment as Visitors read it: plain text, or a link showing
 * the address as written. Its `text` is never HTML, so it is shown as text.
 */
export type CommentSegment =
  | { type: "text"; text: string }
  | { type: "link"; url: string; text: string };

const urlCandidate = /(?:https?:\/\/|www\.)[^\s<>"]+/giu;
const sentencePunctuation = ".,;:!?'\"»…";

function count(text: string, character: string): number {
  return text.split(character).length - 1;
}

/** A URL stops before the punctuation ending its sentence, and before a parenthesis it did not open. */
function trimUrl(candidate: string): string {
  let url = candidate;
  for (;;) {
    const last = url.at(-1) ?? "";
    if (sentencePunctuation.includes(last)) {
      url = url.slice(0, -1);
    } else if (last === ")" && count(url, ")") > count(url, "(")) {
      url = url.slice(0, -1);
    } else {
      return url;
    }
  }
}

/** A Comment's text as Visitors read it: plain text, with its web addresses as links. */
export function bodyOf(text: string): CommentSegment[] {
  const body: CommentSegment[] = [];
  let read = 0;
  for (const match of text.matchAll(urlCandidate)) {
    const address = trimUrl(match[0]);
    const url = /^www\./iu.test(address) ? `https://${address}` : address;
    if (address.length <= "www.".length || !URL.canParse(url)) continue;
    if (match.index > read) {
      body.push({ type: "text", text: text.slice(read, match.index) });
    }
    body.push({ type: "link", url, text: address });
    read = match.index + address.length;
  }
  if (read < text.length) body.push({ type: "text", text: text.slice(read) });
  return body;
}

/** A Commenter's avatar: the first letters of the first two words of their display name. */
export function initialsOf(displayName: string): string {
  return displayName
    .split(" ")
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();
}
