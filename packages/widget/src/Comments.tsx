import type { WidgetData } from "@fox-renard/api/client";
import { useState } from "preact/hooks";
import { locale, t } from "./i18n";
import { relativeDate } from "./relative-date";
import { postComment, type WidgetPage } from "./requests";

type Comment = WidgetData["comments"][number];

function Body({ body }: Pick<Comment, "body">) {
  return (
    <p class="body">
      {body.map((segment) =>
        segment.type === "link" ? (
          <a href={segment.url} target="_blank" rel="nofollow ugc noopener">
            {segment.url}
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
  page: WidgetPage;
  onPosted: (
    posted: Pick<WidgetData, "commenter"> & { comment: Comment },
  ) => void;
}) {
  // The browser's Commenter fills in the display name, so it is typed once.
  const [displayName, setDisplayName] = useState(commenter?.displayName ?? "");
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function post(event: Event) {
    event.preventDefault();
    if (posting) return;
    setPosting(true);
    setFailed(false);
    try {
      onPosted(await postComment(page, { displayName, text }));
      setText("");
    } catch (error) {
      console.error(error);
      setFailed(true);
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
            maxLength={50}
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
          maxLength={5000}
          rows={3}
          value={text}
          onInput={(event) => setText(event.currentTarget.value)}
        />
        {failed && (
          <p class="form-error" role="alert">
            {t("postFailed")}
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
                {comment.author.initials}
              </span>
              <div class="comment-main">
                <p class="comment-meta">
                  <span class="author">{comment.author.displayName}</span>
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
