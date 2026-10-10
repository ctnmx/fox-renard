import type { WidgetData } from "@fox-renard/api/client";
import { useRef } from "preact/hooks";
import { putReaction, type WidgetPage } from "./requests";

type Reactions = Pick<WidgetData, "reactionSet" | "reaction">;

export function ReactionSet({
  page,
  reactionSet,
  reaction,
  onReacted,
}: Reactions & {
  page: WidgetPage;
  onReacted: (reactions: Reactions) => void;
}) {
  // One request at a time, so a double tap cannot issue two browser tokens.
  const reacting = useRef(false);

  async function choose(optionId: string) {
    if (reacting.current) return;
    reacting.current = true;
    try {
      // Tapping the option the Visitor holds removes their Reaction.
      onReacted(
        await putReaction(
          page,
          optionId === reaction?.optionId ? null : optionId,
        ),
      );
    } catch (error) {
      console.error(error);
    } finally {
      reacting.current = false;
    }
  }

  return (
    <fieldset class="reaction-set">
      <legend class="prompt">{reactionSet.prompt}</legend>
      <ul class="options">
        {reactionSet.options.map((option) => (
          <li key={option.id}>
            <button
              class="option"
              type="button"
              aria-pressed={option.id === reaction?.optionId}
              onClick={() => choose(option.id)}
            >
              <span class="picto" aria-hidden="true">
                {option.picto.emoji}
              </span>
              <span class="label">{option.label}</span>
              <span class="count">{option.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
