// ALTCHA, the invisible proof-of-work bot check, run without any third party:
// https://altcha.org. The Widget solves its challenges with the same library.
import type { BotCheck } from "@fox-renard/core";
import {
  type Challenge,
  createChallenge,
  randomInt,
  type Solution,
  verifySolution,
} from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/web/pbkdf2";

/** What the Widget sends with a Comment: the challenge it solved, and how. */
export interface AltchaSolution {
  challenge: Challenge;
  solution: Solution;
}

// WebCrypto's PBKDF2 runs on Workers, Node and browsers alike. A browser
// derives about a thousand keys, a few hundred milliseconds on a phone, while
// the server derives one to issue a challenge and one to verify it.
const algorithm = "PBKDF2/SHA-256";
const cost = 1_000;
const counters = { min: 500, max: 1_500 };

export function createAltchaBotCheck({
  hmacKey,
}: {
  /** The secret that signs each challenge, from a secret of the platform. */
  hmacKey: string;
}): BotCheck {
  return {
    async challenge(issuedAt) {
      const challenge = await createChallenge({
        algorithm,
        cost,
        counter: randomInt(counters.min, counters.max),
        deriveKey,
        hmacSignatureSecret: hmacKey,
        // Signed with the rest, so a browser cannot claim an earlier time.
        data: { issuedAt: issuedAt.toISOString() },
      });
      return { ...challenge };
    },

    async verify(payload) {
      try {
        const { challenge, solution }: AltchaSolution = JSON.parse(payload);
        const { verified } = await verifySolution({
          challenge,
          solution,
          deriveKey,
          hmacSignatureSecret: hmacKey,
        });
        const issuedAt = challenge.parameters.data?.issuedAt;
        if (!verified || typeof issuedAt !== "string") return null;
        return { id: challenge.parameters.nonce, issuedAt: new Date(issuedAt) };
      } catch {
        // A payload that is not a solution solves nothing.
        return null;
      }
    },
  };
}
