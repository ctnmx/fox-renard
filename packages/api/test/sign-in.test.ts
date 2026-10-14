import { beforeEach, describe, expect, test } from "vitest";
import { rectoVerso, startTestApi, type TestApi } from "./harness";

const hour = 60 * 60 * 1000;
const day = 24 * hour;

let api: TestApi;

beforeEach(async () => {
  api = await startTestApi();
});

describe("a Member signs in to the console with a magic link", () => {
  test("a Member requests a sign-in link, follows it from the outbox, and gets a console session", async () => {
    const member = api.newConsole();
    expect((await member.tryHome()).status).toBe(401);

    await member.requestSignInLink("membre@example.com");
    await member.signIn(api.signInLinkTo("membre@example.com"));

    expect(await member.home()).toEqual({
      member: { email: "membre@example.com" },
      organization: { name: "Recto Verso" },
      sites: [{ id: rectoVerso.siteId, name: "Recto Verso" }],
    });
  });

  test("the session cookie stays on the console's host, over HTTPS, out of reach of scripts and of other sites", async () => {
    const member = api.newConsole();
    await member.requestSignInLink("membre@example.com");

    const response = await member.trySignIn(
      api.signInLinkTo("membre@example.com"),
    );

    const cookie = response.headers.get("Set-Cookie") ?? "";
    expect(cookie).toMatch(/^__Host-/);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; SameSite=Strict/);
    expect(cookie).not.toMatch(/; Domain=/);
  });

  test("a sign-in link works once, within an hour of being sent", async () => {
    const member = api.newConsole();
    await member.requestSignInLink("membre@example.com");
    const first = api.signInLinkTo("membre@example.com");
    await member.requestSignInLink("membre@example.com");
    const second = api.signInLinkTo("membre@example.com");

    api.clock.advance(hour - 1);
    await member.signIn(first);
    const again = await api.newConsole().trySignIn(first);
    api.clock.advance(1);
    const expired = await api.newConsole().trySignIn(second);

    expect(again.status).toBe(410);
    expect(await again.json()).toEqual({ error: "sign_in_link_invalid" });
    expect(expired.status).toBe(410);
  });

  test("an address no Member has gets the same answer, and is sent nothing", async () => {
    const response = await api
      .newConsole()
      .requestSignInLink("inconnu@example.com");

    expect(response.status).toBe(202);
    expect(api.outbox.sent).toEqual([]);
  });

  test("a Member's address signs them in whatever its case", async () => {
    const member = api.newConsole();

    await member.requestSignInLink("Membre@Example.com");
    await member.signIn(api.signInLinkTo("membre@example.com"));

    expect((await member.tryHome()).status).toBe(200);
  });

  test("signing out ends the session", async () => {
    const member = api.newConsole();
    await member.requestSignInLink("membre@example.com");
    await member.signIn(api.signInLinkTo("membre@example.com"));
    const session = member.cookie;

    await member.signOut();

    expect(member.cookie).toBeUndefined();
    const replayed = await api.client.v1.console.home.$get(
      {},
      { headers: { Cookie: session ?? "" } },
    );
    expect(replayed.status).toBe(401);
  });

  test("a session lasts 30 days", async () => {
    const member = api.newConsole();
    await member.requestSignInLink("membre@example.com");
    await member.signIn(api.signInLinkTo("membre@example.com"));

    api.clock.advance(30 * day - 1);
    expect((await member.tryHome()).status).toBe(200);
    api.clock.advance(1);
    expect((await member.tryHome()).status).toBe(401);
  });

  test("an address is sent at most 3 sign-in links that still work, so nobody can flood it", async () => {
    const member = api.newConsole();
    for (let i = 0; i < 4; i++) {
      await member.requestSignInLink("membre@example.com");
    }

    expect(api.outbox.sent).toHaveLength(3);
    api.clock.advance(hour);
    await member.requestSignInLink("membre@example.com");
    expect(api.outbox.sent).toHaveLength(4);
  });
});
