// Brevo, the email service Fox Renard sends through in production
// (ADR-0002): https://developers.brevo.com/reference/sendtransacemail
import type { EmailSender } from "@fox-renard/core";

const transactionalEmailEndpoint = "https://api.brevo.com/v3/smtp/email";

/** What Brevo answers when it refuses a request. */
interface BrevoRefusal {
  code?: string;
  message?: string;
}

export function createBrevoEmailSender({
  apiKey,
  senderAddress,
  fetch = globalThis.fetch,
}: {
  /** The Brevo API key, from a secret of the platform. */
  apiKey: string;
  /** The address on Fox Renard's sender domain every email comes from. */
  senderAddress: string;
  fetch?: typeof globalThis.fetch;
}): EmailSender {
  return {
    async send({ to, senderName, subject, text }) {
      const response = await fetch(transactionalEmailEndpoint, {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderAddress },
          to: [{ email: to }],
          subject,
          textContent: text,
        }),
      });
      if (response.ok) return;

      // The reason only: the recipient's address stays out of error logs.
      const refusal: BrevoRefusal = await response.json().catch(() => ({}));
      throw new Error(
        `Brevo refused the email (${response.status} ${refusal.code ?? ""}): ${refusal.message ?? response.statusText}`,
      );
    },
  };
}
