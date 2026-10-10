import type { WidgetData } from "@fox-renard/api/client";
import { useState } from "preact/hooks";
import { locale, type MessageKey, t } from "./i18n";
import { relativeDate } from "./relative-date";
import { type PageConnection, postComment, Refused } from "./requests";

type Comment = WidgetData["comments"][number];

/** What the Visitor reads when Core refuses their Comment, by error code. */
const refusals: Record<string, MessageKey> = {
  invalid_display_name: "invalidDisplayName",
  empty_comment: "emptyComment",
  comment_too_long: "commentTooLong",
};

function Body({ body }: Pick<Comment, "body">) {
  return (
    <p class="body">
      {body.map((segment) =>
        segment.type === "link" ? (
          <a href={segment.url} target="_blank" rel="nofollow ugc noopener">
            {segment.text}
          </a>
        ) : (
          segment.text
        ),
      )}
    </p>
  );
}

export function Comments({
  page,
  commenter,
  comments,
  onPosted,
}: Pick<WidgetData, "commenter" | "comments"> & {
  page: PageConnection;
  onPosted: (
    posted: Pick<WidgetData, "commenter"> & { comment: Comment },
  ) => void;
}) {
  // The browser's Commenter fills in the display name, so it is typed once.
  const [displayName, setDisplayName] = useState(commenter?.displayName ?? "");
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [failure, setFailure] = useState<MessageKey>();

  async function post(event: Event) {
    event.preventDefault();
    if (posting) return;
    setPosting(true);
    setFailure(undefined);
    try {
      onPosted(await postComment(page, { displayName, text }));
      setText("");
    } catch (error) {
      console.error(error);
      setFailure(
        (error instanceof Refused && refusals[error.code]) || "postFailed",
      );
    } finally {
      setPosting(false);
    }
  }

  return (
    <section class="comments">
      <h2 class="comments-title">{t("comments")}</h2>
      <form class="comment-form" onSubmit={post}>
        <label class="field">
          <span class="field-label">{t("displayName")}</span>
          <input
            class="input"
            name="displayName"
            autocomplete="nickname"
            required
            value={displayName}
            onInput={(event) => setDisplayName(event.currentTarget.value)}
          />
        </label>
        <textarea
          class="input comment-box"
          name="text"
          aria-label={t("commentLabel")}
          placeholder={t("commentPlaceholder")}
          required
          rows={3}
          value={text}
          onInput={(event) => setText(event.currentTarget.value)}
        />
        {failure && (
          <p class="form-error" role="alert">
            {t(failure)}
          </p>
        )}
        <button class="post" type="submit" disabled={posting}>
          {t("post")}
        </button>
      </form>
      <ol class="comment-list">
        {comments.map((comment) => (
          <li key={comment.id}>
            <article class="comment">
              <span class="avatar" aria-hidden="true">
                {comment.commenter.initials}
              </span>
              <div class="comment-main">
                <p class="comment-meta">
                  <span class="display-name">
                    {comment.commenter.displayName}
                  </span>
                  <time
                    dateTime={comment.createdAt}
                    title={new Date(comment.createdAt).toLocaleString(locale)}
                  >
                    {relativeDate(new Date(comment.createdAt))}
                  </time>
                </p>
                <Body body={comment.body} />
              </div>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}
