import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";
import { Notice } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="container narrow">
      <h1>{t("errors.not_found.title")}</h1>
      <p className="muted">{t("errors.not_found.body")}</p>
      <Link to="/">{t("common.go_home")}</Link>
    </div>
  );
}

export function RouteErrorPage() {
  const error = useRouteError();
  const { t } = useI18n();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  if (import.meta.env.DEV) console.error(error);
  return (
    <div className="container narrow">
      <h1>{t("errors.crash.title")}</h1>
      <p className="muted">{t("errors.crash.body")}</p>
      <a href="/">{t("common.go_home")}</a>
    </div>
  );
}

/**
 * DRAFT privacy notice. Must be replaced with text reviewed by qualified local
 * counsel (GDPR, minors / guardian consent in Bulgaria) before public launch.
 */
export function PrivacyPage() {
  const { t } = useI18n();
  return (
    <div className="container narrow prose">
      <h1>{t("privacy.title")}</h1>
      <Notice tone="warning">{t("privacy.draft_notice")}</Notice>
      <h2>{t("privacy.collected.title")}</h2>
      <p>{t("privacy.collected.body")}</p>
      <h2>{t("privacy.not_collected.title")}</h2>
      <p>{t("privacy.not_collected.body")}</p>
      <h2>{t("privacy.visibility.title")}</h2>
      <p>{t("privacy.visibility.body")}</p>
      <h2>{t("privacy.content.title")}</h2>
      <p>{t("privacy.content.body")}</p>
    </div>
  );
}
