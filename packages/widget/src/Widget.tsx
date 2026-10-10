import type { WidgetData } from "@fox-renard/api/client";
import { useEffect, useState } from "preact/hooks";
import { Comments } from "./Comments";
import { t } from "./i18n";
import { ReactionSet } from "./ReactionSet";
import { fetchWidgetData, type PageConnection } from "./requests";

export function Widget(page: PageConnection) {
  const [data, setData] = useState<WidgetData>();
  const { client, siteId, pageKey } = page;

  useEffect(() => {
    fetchWidgetData({ client, siteId, pageKey }).then(setData, console.error);
  }, [client, siteId, pageKey]);

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
        onPosted={({ commenter, comment }) =>
          setData(
            (data) =>
              data && {
                ...data,
                commenter,
                comments: [comment, ...data.comments],
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
