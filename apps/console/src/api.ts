import {
  createClient,
  type ListedStatus,
  listedStatuses,
} from "@fox-renard/api/client";
import { queryOptions } from "@tanstack/react-query";

// The Worker serves the console and the HTTP API on one origin, so the
// session cookie, which no other origin receives, goes with each request.
const client = createClient(location.origin);

/** Whether a value, such as one from the console's address, is a status Comments are listed by. */
export function isListedStatus(value: unknown): value is ListedStatus {
  return listedStatuses.some((status) => status === value);
}

/** The console's session ended, or never began. */
export class SignedOut extends Error {}

/** Throws for a response that did not succeed. */
function fail({ status }: { status: number }): never {
  if (status === 401) throw new SignedOut();
  throw new Error(`The HTTP API answered ${status}`);
}

/** The signed-in Member's Organization and Sites, or `null` when signed out. */
async function fetchHome() {
  const response = await client.v1.console.home.$get();
  if (response.status === 401) return null;
  if (response.status !== 200) fail(response);
  return response.json();
}

export type Home = NonNullable<Awaited<ReturnType<typeof fetchHome>>>;

export const homeQuery = queryOptions({
  queryKey: ["home"],
  queryFn: fetchHome,
});

/** The Pages of a Site that hold Comments, with how many each status holds. */
export function pagesQuery(siteId: string) {
  return queryOptions({
    queryKey: ["pages", siteId],
    queryFn: async () => {
      const response = await client.v1.console.sites[":siteId"].pages.$get({
        param: { siteId },
      });
      if (response.status !== 200) fail(response);
      return (await response.json()).pages;
    },
  });
}

/** A Site's Comments with one status, newest first, on one Page or all. */
async function fetchComments(
  siteId: string,
  status: ListedStatus,
  pageKey: string | undefined,
) {
  const response = await client.v1.console.sites[":siteId"].comments.$get({
    param: { siteId },
    query: { status, page: pageKey },
  });
  if (response.status !== 200) fail(response);
  return (await response.json()).comments;
}

export type ConsoleComment = Awaited<ReturnType<typeof fetchComments>>[number];

export function commentsQuery(
  siteId: string,
  status: ListedStatus,
  pageKey: string | undefined,
) {
  return queryOptions({
    queryKey: ["comments", siteId, status, pageKey],
    queryFn: () => fetchComments(siteId, status, pageKey),
  });
}

export async function requestSignInLink(email: string): Promise<void> {
  const response = await client.v1.console["sign-in-links"].$post({
    json: { email },
  });
  if (!response.ok) fail(response);
}

/** Follows a sign-in link; `false` when it no longer works. */
export async function signIn(token: string): Promise<boolean> {
  const response = await client.v1.console.sessions.$post({ json: { token } });
  if (response.status === 410) return false;
  if (!response.ok) fail(response);
  return true;
}

export async function signOut(): Promise<void> {
  const response = await client.v1.console.sessions.current.$delete();
  if (!response.ok) fail(response);
}

/** What a Member can do to a Comment. */
export const moderate = {
  async approve(commentId: string) {
    const response = await client.v1.console.comments[
      ":commentId"
    ].approve.$post({ param: { commentId } });
    if (!response.ok) fail(response);
  },
  async markAsSpam(commentId: string) {
    const response = await client.v1.console.comments[":commentId"].spam.$post({
      param: { commentId },
    });
    if (!response.ok) fail(response);
  },
  async delete(commentId: string) {
    const response = await client.v1.console.comments[":commentId"].$delete({
      param: { commentId },
    });
    if (!response.ok) fail(response);
  },
};
