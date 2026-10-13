import { type Challenge, solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/web/pbkdf2";
import { fetchBotChallenge, type PageConnection } from "./requests";

/** A bot check under way, started when the Visitor begins writing. */
export interface BotCheckRun {
  /** The solution to send with the Comment, once the Comment may post. */
  solution(): Promise<string>;
}

/**
 * Solves an ALTCHA challenge in the background, so the Visitor never sees
 * a puzzle, and waits out the minimum time the challenge asks for.
 */
export function startBotCheck(page: PageConnection): BotCheckRun {
  const solved = (async () => {
    const { challenge, postableIn } = await fetchBotChallenge(page);
    // The challenge was issued before it arrived, so waiting from here is enough.
    const postableAt = performance.now() + postableIn;
    const solution = await solveChallenge({
      // The API's challenge is ALTCHA's, which its type leaves open.
      challenge: challenge as unknown as Challenge,
      deriveKey,
    });
    if (!solution) throw new Error("Fox Renard: the bot check timed out.");
    return { payload: JSON.stringify({ challenge, solution }), postableAt };
  })();
  // A failure surfaces when the Comment posts, not before.
  solved.catch(() => {});

  return {
    async solution() {
      const { payload, postableAt } = await solved;
      const wait = postableAt - performance.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      return payload;
    },
  };
}
