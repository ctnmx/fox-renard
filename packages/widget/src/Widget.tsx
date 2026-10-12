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
  // The magic link waits for the Visitor's click: a mail scanner that opens
  // the page does not click, so it cannot spend the link.
  const [pendingToken, setPendingToken] = useState(magicLinkToken);
  const [confirming, setConfirming] = useState(false);
  const [verification, setVerification] = useState<MessageKey>();
  // Counts the loads asked for, so that confirming loads the badge.
  const [loads, setLoads] = useState(0);
  const { client, siteId, pageKey } = page;

  async function confirm(token: string) {
    if (confirming) return;
    setConfirming(true);
    try {
      await followMagicLink(page, token);
      setVerification("emailConfirmed");
      setPendingToken(null);
      setLoads((loads) => loads + 1);
    } catch (error) {
      console.error(error);
      // A link refused for good leaves; any other failure can be retried.
      if (error instanceof Refused && error.code === "magic_link_invalid") {
        setVerification("magicLinkInvalid");
        setPendingToken(null);
      } else {
        setVerification("magicLinkFailed");
      }
    } finally {
      setConfirming(false);
    }
  }

  useEffect(() => {
    // The order chosen last wins over one still loading.
    let latest = true;
    fetchWidgetData({ client, siteId, pageKey }, sort).then((data) => {
      if (latest) setData(data);
    }, console.error);
    return () => {
      latest = false;
    };
  }, [client, siteId, pageKey, sort, loads]);

  if (!data) return null;

  return (
    <div class="widget">
      {verification && (
        <p class="notice" role="status">
          {t(verification)}
        </p>
      )}
      {pendingToken !== null && (
        <div class="confirm-email">
          <p class="confirm-email-prompt">{t("confirmEmailPrompt")}</p>
          <button
            class="post"
            type="button"
            disabled={confirming}
            onClick={() => confirm(pendingToken)}
          >
            {t("confirmEmail")}
          </button>
        </div>
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
