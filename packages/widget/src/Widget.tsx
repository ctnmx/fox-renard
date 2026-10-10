import type { CommentSort, WidgetData } from "@fox-renard/api/client";
import { useEffect, useState } from "preact/hooks";
import { Comments, withPosted, withVote } from "./Comments";
import { t } from "./i18n";
import { ReactionSet } from "./ReactionSet";
import { fetchWidgetData, type PageConnection } from "./requests";

export function Widget(page: PageConnection) {
  const [data, setData] = useState<WidgetData>();
  // The order the Visitor chose, if any; the Widget data tells the default.
  const [sort, setSort] = useState<CommentSort | null>(null);
  const { client, siteId, pageKey } = page;

  useEffect(() => {
    // The order chosen last wins over one still loading.
    let latest = true;
    fetchWidgetData({ client, siteId, pageKey }, sort).then((data) => {
      if (latest) setData(data);
    }, console.error);
    return () => {
      latest = false;
    };
  }, [client, siteId, pageKey, sort]);

  if (!data) return null;

  return (
    <div class="widget">
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
