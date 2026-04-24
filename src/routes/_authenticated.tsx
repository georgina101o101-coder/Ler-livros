import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (!user) {
    // Redirect to /auth via effect-free render
    queueMicrotask(() => navigate({ to: "/auth" }));
    return null;
  }

  return <Outlet />;
}
