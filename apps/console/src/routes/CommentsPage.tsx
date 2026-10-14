import type { ListedStatus } from "@fox-renard/api/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useNavigate,
  useRouteContext,
  useSearch,
} from "@tanstack/react-router";
import {
  type ConsoleComment,
  commentsQuery,
  isListedStatus,
  moderate,
  pagesQuery,
} from "@/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { strings } from "@/strings";

const dateFormat = new Intl.DateTimeFormat("fr", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** The order of the status tabs: what waits for the Member first. */
const tabs: ListedStatus[] = ["pending", "published", "spam"];

/** Approves, marks as spam or deletes a Comment, then lists Comments anew. */
function useModeration(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      action,
      commentId,
    }: {
      action: keyof typeof moderate;
      commentId: string;
    }) => moderate[action](commentId),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["comments", siteId] }),
        queryClient.invalidateQueries({ queryKey: ["pages", siteId] }),
      ]),
  });
}

function CommentCard({
  comment,
  status,
  siteId,
}: {
  comment: ConsoleComment;
  status: ListedStatus;
  siteId: string;
}) {
  const moderation = useModeration(siteId);
  const act = (action: keyof typeof moderate) =>
    moderation.mutate({ action, commentId: comment.id });

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex flex-wrap items-center gap-2">
          {comment.commenter.displayName}
          {comment.commenter.verified && (
            <Badge variant="secondary">{strings.verified}</Badge>
          )}
          {comment.reply && <Badge variant="outline">{strings.reply}</Badge>}
        </CardTitle>
        <CardDescription>
          {comment.page.title} ·{" "}
          <time dateTime={comment.createdAt}>
            {dateFormat.format(new Date(comment.createdAt))}
          </time>
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <p className="whitespace-pre-wrap break-words">{comment.text}</p>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 px-4">
        {status !== "published" && (
          <Button
            size="sm"
            disabled={moderation.isPending}
            onClick={() => act("approve")}
          >
            {strings.approve}
          </Button>
        )}
        {status !== "spam" && (
          <Button
            size="sm"
            variant="outline"
            disabled={moderation.isPending}
            onClick={() => act("markAsSpam")}
          >
            {strings.markAsSpam}
          </Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={moderation.isPending}
            >
              {strings.delete}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{strings.deleteTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {strings.deleteDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{strings.cancel}</AlertDialogCancel>
              <AlertDialogAction onClick={() => act("delete")}>
                {strings.delete}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
      {moderation.isError && (
        <p role="alert" className="px-4 text-sm text-destructive">
          {strings.failed}
        </p>
      )}
    </Card>
  );
}

/** A Site's Comments, by status and by Page, for its Members to moderate. */
export function CommentsPage() {
  const { home } = useRouteContext({ from: "/" });
  const search = useSearch({ from: "/" });
  const navigate = useNavigate({ from: "/" });
  const site = home.sites.find(({ id }) => id === search.site) ?? home.sites[0];
  const siteId = site?.id ?? "";
  const pages = useQuery({ ...pagesQuery(siteId), enabled: Boolean(site) });
  const comments = useQuery({
    ...commentsQuery(siteId, search.status, search.page),
    enabled: Boolean(site),
  });

  const total = (status: ListedStatus) =>
    (pages.data ?? [])
      .filter(({ key }) => search.page === undefined || key === search.page)
      .reduce((sum, { counts }) => sum + counts[status], 0);

  return (
    <>
      <h1 className="text-2xl font-semibold">
        {strings.comments}
        {home.sites.length > 1 && site && (
          <span className="font-normal text-muted-foreground">
            {" "}
            · {site.name}
          </span>
        )}
      </h1>
      <Tabs
        value={search.status}
        onValueChange={(status) => {
          if (isListedStatus(status)) {
            void navigate({ search: (previous) => ({ ...previous, status }) });
          }
        }}
      >
        <TabsList className="w-full">
          {tabs.map((status) => (
            <TabsTrigger key={status} value={status}>
              {strings.statuses[status]}
              {pages.data && (
                <span className="text-muted-foreground tabular-nums">
                  {total(status)}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex flex-col gap-2">
        <Label htmlFor="page">{strings.page}</Label>
        <NativeSelect
          id="page"
          className="w-full"
          value={search.page ?? ""}
          onChange={(event) => {
            const page = event.currentTarget.value || undefined;
            void navigate({ search: (previous) => ({ ...previous, page }) });
          }}
        >
          <NativeSelectOption value="">{strings.allPages}</NativeSelectOption>
          {pages.data?.map(({ key, title }) => (
            <NativeSelectOption key={key} value={key}>
              {title}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {comments.isError && (
        <p role="alert" className="text-destructive">
          {strings.failed}
        </p>
      )}
      {comments.data?.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">
          {strings.noComments[search.status]}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {comments.data?.map((comment) => (
          <li key={comment.id}>
            <CommentCard
              comment={comment}
              status={search.status}
              siteId={siteId}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
