import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { requestSignInLink, signIn } from "@/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { strings } from "@/strings";

type Status = "idle" | "sending" | "sent" | "invalid" | "failed";

/**
 * Asks for a sign-in link, or follows the one the page was opened from. The
 * Member confirms first, so that a mail scanner opening the link cannot spend
 * it.
 */
export function SignInPage() {
  // The token of the sign-in link the page was opened from, if any.
  const token = useLocation({
    select: ({ hash }) => new URLSearchParams(hash).get("token"),
  });
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function follow() {
    if (!token) return;
    setStatus("sending");
    try {
      if (!(await signIn(token))) {
        setStatus("invalid");
        return;
      }
      await queryClient.invalidateQueries();
      // Replacing the address keeps the spent token out of the history.
      await navigate({ to: "/", search: { status: "pending" }, replace: true });
    } catch {
      setStatus("failed");
    }
  }

  async function request(event: FormEvent) {
    event.preventDefault();
    setStatus("sending");
    try {
      await requestSignInLink(email);
      setStatus("sent");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle>{strings.signInTitle}</CardTitle>
        <CardDescription>
          {token && status !== "invalid"
            ? strings.followLinkIntro
            : strings.signInIntro}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {token && status !== "invalid" ? (
          <Button onClick={follow} disabled={status === "sending"}>
            {strings.signIn}
          </Button>
        ) : (
          <form onSubmit={request} className="flex flex-col gap-3">
            <Label htmlFor="email">{strings.email}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
            <Button type="submit" disabled={status === "sending"}>
              {strings.sendLink}
            </Button>
          </form>
        )}
        {(status === "sent" || status === "invalid" || status === "failed") && (
          <p role="status" className="text-sm text-muted-foreground">
            {status === "sent"
              ? strings.linkSent
              : status === "invalid"
                ? strings.linkInvalid
                : strings.failed}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
