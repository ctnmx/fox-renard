import type { CommentSort, WidgetData } from "@fox-renard/api/client";
import { useEffect, useState } from "preact/hooks";
import { Comments, withPosted, withVote } from "./Comments";
import { type MessageKey, t } from "./i18n";
import { ReactionSet } from "./ReactionSet";
import {
  fetchWidgetData,
  followMagicLink,
  type PageConnection,
  Refused,
} from "./requests";

export function Widget({
  magicLinkToken,
  ...page
}: PageConnection & {
  /** The token of the magic link the page was opened from, if any. */
  magicLinkToken: string | null;
}) {
  const [data, setData] = useState<WidgetData>();
  // The order the Visitor chose, if any; the Widget data tells the default.
  const [sort, setSort] = useState<CommentSort | null>(null);
  // The magic link is followed first, so that the data shows its badge.
  const [following, setFollowing] = useState(magicLinkToken !== null);
  const [verification, setVerification] = useState<MessageKey>();
  const { client, siteId, pageKey } = page;

  useEffect(() => {
    if (magicLinkToken === null) return;
    followMagicLink({ client, siteId, pageKey }, magicLinkToken)
      .then(
        () => setVerification("emailConfirmed"),
        (error) => {
          console.error(error);
          setVerification(
            error instanceof Refused && error.code === "magic_link_invalid"
              ? "magicLinkInvalid"
              : "magicLinkFailed",
          );
        },
      )
      .finally(() => setFollowing(false));
  }, [client, siteId, pageKey, magicLinkToken]);

  useEffect(() => {
    if (following) return;
    // The order chosen last wins over one still loading.
    let latest = true;
    fetchWidgetData({ client, siteId, pageKey }, sort).then((data) => {
      if (latest) setData(data);
    }, console.error);
    return () => {
      latest = false;
    };
  }, [client, siteId, pageKey, sort, following]);

  if (!data) return null;

  return (
    <div class="widget">
      {verification && (
        <p class="notice" role="status">
          {t(verification)}
        </p>
      )}
      <ReactionSet
        page={page}
        reactionSet={data.reactionSet}
        reaction={data.reaction}
        onReacted={({ reactionSet, reaction }) =>
          setData((data) => data && { ...data, reactionSet, reaction })
        }
      />
      <Comments
        page={page}
        commenter={data.commenter}
        comments={data.comments}
        sort={sort ?? data.sort}
        onSort={setSort}
        onVoted={(commentId, voted) =>
          setData(
            (data) =>
              data && {
                ...data,
                comments: withVote(data.comments, commentId, voted),
              },
          )
        }
        onPosted={(posted) =>
          setData(
            (data) =>
              data && {
                ...data,
                commenter: posted.commenter,
                comments: withPosted(data.comments, posted),
              },
          )
        }
      />
      <a
        class="powered-by"
        href="https://foxrenard.com"
        target="_blank"
        rel="noopener"
      >
        {t("poweredBy")}
      </a>
    </div>
  );
}
