import { signInPath } from "@fox-renard/api/client";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SignedOut } from "./api";
import { createConsoleRouter } from "./router";
import "./index.css";

// A session that ends while the console is open sends the Member to sign in again.
function onError(error: Error) {
  if (!(error instanceof SignedOut)) return;
  queryClient.clear();
  void router.navigate({ to: signInPath });
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
});
const router = createConsoleRouter(queryClient);

const root = document.getElementById("root");
if (!root) throw new Error("The console's page has no #root element.");
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
