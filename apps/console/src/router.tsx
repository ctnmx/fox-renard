import {
  type ModeratedStatus,
  moderatedStatuses,
  signInPath,
} from "@fox-renard/api/client";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { homeQuery } from "./api";
import { CommentsPage } from "./routes/CommentsPage";
import { Layout } from "./routes/Layout";
import { SignInPage } from "./routes/SignInPage";

/** Which Comments the console lists, as its address tells. */
export interface CommentsSearch {
  status: ModeratedStatus;
  /** The Page Key of the Page whose Comments to list, or all Pages. */
  page?: string;
  /** The Site whose Comments to list, or the Member's first. */
  site?: string;
}

function isModeratedStatus(value: unknown): value is ModeratedStatus {
  return moderatedStatuses.some((status) => status === value);
}

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Layout,
});

const commentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>): CommentsSearch => ({
    // Pending Comments are the ones waiting for the Member.
    status: isModeratedStatus(search.status) ? search.status : "pending",
    page: typeof search.page === "string" ? search.page : undefined,
    site: typeof search.site === "string" ? search.site : undefined,
  }),
  beforeLoad: async ({ context }) => {
    const home = await context.queryClient.ensureQueryData(homeQuery);
    if (!home) throw redirect({ to: signInPath });
    return { home };
  },
  component: CommentsPage,
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: signInPath,
  component: SignInPage,
});

export function createConsoleRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree: rootRoute.addChildren([commentsRoute, signInRoute]),
    context: { queryClient },
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createConsoleRouter>;
  }
}
