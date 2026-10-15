import type { Email } from "@fox-renard/core";
import { describe, expect, test } from "vitest";
import { createBrevoEmailSender } from "../src";

/** Stands in for Brevo's API: it keeps each request it gets and answers `answer`. */
function standInBrevo(answer: () => Response) {
  const requests: Request[] = [];
  return {
    requests,
    async fetch(input: RequestInfo | URL, init?: RequestInit) {
      requests.push(new Request(input, init));
      return answer();
    },
  };
}

const accepted = () =>
  Response.json(
    { messageId: "<202610121200.1@smtp-relay.mailin.fr>" },
    {
      status: 201,
    },
  );

const email: Email = {
  to: "marie@example.com",
  senderName: "Recto Verso via Fox Renard",
  subject: "Confirme ton adresse email sur Recto Verso",
  text: "Bonjour Marie,\n\nhttps://www.rectoverso.co/article/tour-du-mont-aiguille#fox-renard-magic-link=abc",
};

describe("the Brevo adapter", () => {
  test("sends an email through Brevo's transactional API, under its sender name from Fox Renard's address", async () => {
    const brevo = standInBrevo(accepted);
    const sender = createBrevoEmailSender({
      apiKey: "xkeysib-test",
      senderAddress: "ne-pas-repondre@foxrenard.com",
      fetch: brevo.fetch,
    });

    await sender.send(email);

    expect(brevo.requests).toHaveLength(1);
    const [request] = brevo.requests;
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(request?.headers.get("api-key")).toBe("xkeysib-test");
    expect(request?.headers.get("content-type")).toBe("application/json");
    expect(await request?.json()).toEqual({
      sender: {
        name: "Recto Verso via Fox Renard",
        email: "ne-pas-repondre@foxrenard.com",
      },
      to: [{ email: "marie@example.com" }],
      subject: "Confirme ton adresse email sur Recto Verso",
      textContent:
        "Bonjour Marie,\n\nhttps://www.rectoverso.co/article/tour-du-mont-aiguille#fox-renard-magic-link=abc",
    });
  });

  test("throws Brevo's reason when Brevo refuses the email, without naming its recipient", async () => {
    const brevo = standInBrevo(() =>
      Response.json(
        { code: "unauthorized", message: "Key not found" },
        { status: 401 },
      ),
    );
    const sender = createBrevoEmailSender({
      apiKey: "xkeysib-revoked",
      senderAddress: "ne-pas-repondre@foxrenard.com",
      fetch: brevo.fetch,
    });

    const refused = sender.send(email);

    await expect(refused).rejects.toThrow(
      "Brevo refused the email (401 unauthorized): Key not found",
    );
    await expect(refused).rejects.not.toThrow("marie@example.com");
  });
});
