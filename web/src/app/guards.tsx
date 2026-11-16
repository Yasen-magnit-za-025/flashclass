import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { PageLoader } from "@/components/ui";
import type { AppRole } from "@/domain/taxonomy";
import { safeNextPath } from "@/features/auth/validation";
import { useI18n } from "@/i18n/I18nProvider";
import { useSession } from "./session";

/** Usability only: hides pages the user can't use. RLS enforces access. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();
  if (status === "loading") return <PageLoader />;
  if (status === "signedOut") {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth/sign-in?next=${next}`} replace />;
  }
  return children ?? <Outlet />;
}

export function RequireRole({ role, children }: { role: AppRole; children?: ReactNode }) {
  const { roles, status } = useSession();
  const { t } = useI18n();
  if (status === "loading") return <PageLoader />;
  if (!roles.has(role)) {
    return (
      <div className="container narrow">
        <h1>{t("errors.no_access.title")}</h1>
        <p className="muted">{t(role === "admin" ? "errors.no_access.admin" : "errors.no_access.teacher")}</p>
      </div>
    );
  }
  return children ?? <Outlet />;
}

/** Sends signed-in users away from sign-in/sign-up pages. */
export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();
  if (status === "loading") return <PageLoader />;
  if (status === "signedIn") {
    return <Navigate to={safeNextPath(new URLSearchParams(location.search).get("next"))} replace />;
  }
  return children;
}
