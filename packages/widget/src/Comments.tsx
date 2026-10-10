import type { WidgetData } from "@fox-renard/api/client";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { locale, type MessageKey, t } from "./i18n";
import { relativeDate } from "./relative-date";
import { type PageConnection, postComment, Refused } from "./requests";

type TopLevelComment = WidgetData["comments"][number];
type Comment = TopLevelComment["replies"][number];
type Posted = Awaited<ReturnType<typeof postComment>>;

/** What the Visitor reads when Core refuses their Comment, by error code. */
const refusals: Record<string, MessageKey> = {
  invalid_display_name: "invalidDisplayName",
  empty_comment: "emptyComment",
  comment_too_long: "commentTooLong",
};

/**
 * A Page's Comments once the browser posts one: a top-level Comment comes
 * first, and a Reply comes last under its top-level Comment.
 */
export function withPosted(
  comments: TopLevelComment[],
  { comment, topLevelCommentId }: Posted,
): TopLevelComment[] {
  if (topLevelCommentId === null) {
    return [{ ...comment, replies: [] }, ...comments];
  }
  return comments.map((topLevel) =>
    topLevel.id === topLevelCommentId
      ? { ...topLevel, replies: [...topLevel.replies, comment] }
      : topLevel,
  );
}

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

function CommentArticle({
  comment,
  onReply,
}: {
  comment: Comment;
  /** Opens a Reply to this Comment; `opener` gets the focus back once it closes. */
  onReply: (opener: HTMLButtonElement) => void;
}) {
  return (
    <article class="comment">
      <span class="avatar" aria-hidden="true">
        {comment.commenter.initials}
      </span>
      <div class="comment-main">
        <p class="comment-meta">
          <span class="display-name">{comment.commenter.displayName}</span>
          <time
            dateTime={comment.createdAt}
            title={new Date(comment.createdAt).toLocaleString(locale)}
          >
            {relativeDate(new Date(comment.createdAt))}
          </time>
        </p>
        <Body body={comment.body} />
        <button
          class="reply"
          type="button"
          onClick={(event) => onReply(event.currentTarget)}
        >
          {t("reply")}
        </button>
      </div>
    </article>
  );
}

function CommentForm({
  page,
  displayName,
  onDisplayName,
  answering,
  onPosted,
  onCancel,
}: {
  page: PageConnection;
  /** Shared by every form, so the Visitor types it once. */
  displayName: string;
  onDisplayName: (displayName: string) => void;
  /** The Comment this form Replies to, or none for a top-level Comment. */
  answering?: Comment;
  onPosted: (posted: Posted) => void;
  onCancel?: () => void;
}) {
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [failure, setFailure] = useState<MessageKey>();
  const headingId = useId();
  const displayNameInput = useRef<HTMLInputElement>(null);
  const textBox = useRef<HTMLTextAreaElement>(null);

  // A Reply form opens on its first empty field.
  useEffect(() => {
    if (!answering) return;
    (displayNameInput.current?.value
      ? textBox
      : displayNameInput
    ).current?.focus();
  }, [answering]);

  async function post(event: Event) {
    event.preventDefault();
    if (posting) return;
    setPosting(true);
    setFailure(undefined);
    try {
      onPosted(
        await postComment(page, { displayName, text, replyTo: answering?.id }),
      );
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
    <form
      class={answering ? "comment-form reply-form" : "comment-form"}
      aria-labelledby={answering && headingId}
      onSubmit={post}
    >
      {answering && (
        <p class="reply-heading" id={headingId}>
          {t("replyTo", { name: answering.commenter.displayName })}
        </p>
      )}
      <label class="field">
        <span class="field-label">{t("displayName")}</span>
        <input
          ref={displayNameInput}
          class="input"
          name="displayName"
          autocomplete="nickname"
          required
          value={displayName}
          onInput={(event) => onDisplayName(event.currentTarget.value)}
        />
      </label>
      <textarea
        ref={textBox}
        class="input comment-box"
        name="text"
        aria-label={t(answering ? "replyLabel" : "commentLabel")}
        placeholder={t(answering ? "replyPlaceholder" : "commentPlaceholder")}
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
      <div class="form-actions">
        {onCancel && (
          <button class="cancel" type="button" onClick={onCancel}>
            {t("cancel")}
          </button>
        )}
        <button class="post" type="submit" disabled={posting}>
          {t("post")}
        </button>
      </div>
    </form>
  );
}

/** The Comment a Visitor is replying to, and the top-level Comment their Reply form opens under. */
interface Answering {
  comment: Comment;
  topLevelCommentId: string;
  /** The button that opened the Reply form. */
  opener: HTMLButtonElement;
}

export function Comments({
  page,
  commenter,
  comments,
  onPosted,
}: Pick<WidgetData, "commenter" | "comments"> & {
  page: PageConnection;
  onPosted: (posted: Posted) => void;
}) {
  // The browser's Commenter fills in the display name, so it is typed once.
  const [displayName, setDisplayName] = useState(commenter?.displayName ?? "");
  const [answering, setAnswering] = useState<Answering>();

  function stopAnswering() {
    answering?.opener.focus();
    setAnswering(undefined);
  }

  return (
    <section class="comments">
      <h2 class="comments-title">{t("comments")}</h2>
      <CommentForm
        page={page}
        displayName={displayName}
        onDisplayName={setDisplayName}
        onPosted={onPosted}
      />
      <ol class="comment-list">
        {comments.map((topLevel) => {
          const openReplyTo =
            (comment: Comment) => (opener: HTMLButtonElement) =>
              setAnswering({ comment, topLevelCommentId: topLevel.id, opener });
          return (
            <li key={topLevel.id}>
              <CommentArticle
                comment={topLevel}
                onReply={openReplyTo(topLevel)}
              />
              {topLevel.replies.length > 0 && (
                <ol
                  class="replies"
                  aria-label={t("repliesTo", {
                    name: topLevel.commenter.displayName,
                  })}
                >
                  {topLevel.replies.map((reply) => (
                    <li key={reply.id}>
                      <CommentArticle
                        comment={reply}
                        onReply={openReplyTo(reply)}
                      />
                    </li>
                  ))}
                </ol>
              )}
              {answering?.topLevelCommentId === topLevel.id && (
                <CommentForm
                  key={answering.comment.id}
                  page={page}
                  displayName={displayName}
                  onDisplayName={setDisplayName}
                  answering={answering.comment}
                  onPosted={(posted) => {
                    onPosted(posted);
                    stopAnswering();
                  }}
                  onCancel={stopAnswering}
                />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
