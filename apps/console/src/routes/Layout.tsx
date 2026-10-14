import { signInPath } from "@fox-renard/api/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { homeQuery, signOut } from "@/api";
import { Button } from "@/components/ui/button";
import { strings } from "@/strings";

export function Layout() {
  const { data: home } = useQuery(homeQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function leave() {
    await signOut();
    queryClient.clear();
    await navigate({ to: signInPath });
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 px-4 py-4 sm:py-8">
      <header className="flex items-center justify-between gap-4">
        <p className="flex items-center gap-2 font-semibold">
          <span aria-hidden="true" className="size-3 rounded-full bg-fox" />
          Fox Renard
          {home && (
            <span className="truncate font-normal text-muted-foreground">
              {home.organization.name}
            </span>
          )}
        </p>
        {home && (
          <Button variant="ghost" size="sm" onClick={leave}>
            {strings.signOut}
          </Button>
        )}
      </header>
      <main className="flex flex-col gap-4">
        <Outlet />
      </main>
    </div>
  );
}
