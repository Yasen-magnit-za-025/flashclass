import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useSession } from "@/app/session";
import { Badge, Button, EmptyState, ErrorBanner, Field, Notice, Spinner } from "@/components/ui";
import type { AppRole } from "@/domain/taxonomy";
import { KindBadge } from "@/features/library/components";
import { useI18n } from "@/i18n/I18nProvider";
import { useHiddenMaterials, useInviteTeacher, useModerate, useReports, useResolveReport, useSetRole, useUsers } from "./api";

type Tab = "reports" | "hidden" | "users" | "invite";
const TABS: Tab[] = ["reports", "hidden", "users", "invite"];

function ReportsTab() {
  const { t, formatDate } = useI18n();
  const [status, setStatus] = useState<"open" | "resolved" | "dismissed">("open");
  const reports = useReports(status);
  const resolve = useResolveReport();
  const moderate = useModerate();

  return (
    <section className="stack">
      <div className="row">
        {(["open", "resolved", "dismissed"] as const).map((s) => (
          <Button key={s} variant={s === status ? "primary" : "ghost"} onClick={() => setStatus(s)} aria-pressed={s === status}>
            {t(`admin.reports.status.${s}`)}
          </Button>
        ))}
      </div>
      <ErrorBanner error={reports.error ?? resolve.error ?? moderate.error} />
      {reports.isPending ? (
        <Spinner label={t("common.loading")} />
      ) : !reports.data?.length ? (
        <EmptyState title={t("admin.reports.empty")} />
      ) : (
        <ul className="stack">
          {reports.data.map((r) => (
            <li key={r.id} className="card stack-sm">
              <div className="row wrap space-between">
                <div className="row wrap gap-sm">
                  <Badge tone="warning">{t(`report.reasons.${r.reason}`)}</Badge>
                  {r.material && <KindBadge kind={r.material.kind} />}
                  {r.material && <Badge>{t(`status.${r.material.status}`)}</Badge>}
                </div>
                <span className="muted small">{formatDate(r.created_at)}</span>
              </div>
              {r.material && (
                <Link to={`/m/${r.material.id}`} target="_blank" rel="noreferrer">
                  {r.material.title}
                </Link>
              )}
              {r.details && <p className="quote">{r.details}</p>}
              {r.resolution_note && <p className="muted small">{r.resolution_note}</p>}
              {status === "open" && r.material && (
                <div className="row wrap">
                  {r.material.status !== "hidden" && (
                    <Button
                      variant="danger"
                      busy={moderate.isPending}
                      onClick={() => moderate.mutate({ materialId: r.material!.id, action: "hide", reason: t(`report.reasons.${r.reason}`) })}
                    >
                      {t("admin.hide")}
                    </Button>
                  )}
                  <Button busy={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, status: "resolved", note: "" })}>
                    {t("admin.reports.resolve")}
                  </Button>
                  <Button variant="ghost" busy={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, status: "dismissed", note: "" })}>
                    {t("admin.reports.dismiss")}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HiddenTab() {
  const { t, formatDate } = useI18n();
  const hidden = useHiddenMaterials();
  const moderate = useModerate();
  return (
    <section className="stack">
      <p className="muted">{t("admin.hidden.hint")}</p>
      <ErrorBanner error={hidden.error ?? moderate.error} />
      {hidden.isPending ? (
        <Spinner label={t("common.loading")} />
      ) : !hidden.data?.length ? (
        <EmptyState title={t("admin.hidden.empty")} />
      ) : (
        <table className="table">
          <tbody>
            {hidden.data.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link to={`/m/${m.id}`}>{m.title}</Link> <KindBadge kind={m.kind} />
                  {m.hidden_reason && <p className="small muted">{m.hidden_reason}</p>}
                </td>
                <td>{formatDate(m.hidden_at)}</td>
                <td>
                  <Button busy={moderate.isPending} onClick={() => moderate.mutate({ materialId: m.id, action: "restore" })}>
                    {t("admin.restore")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function UsersTab() {
  const { t, formatDate } = useI18n();
  const { user: me } = useSession();
  const [search, setSearch] = useState("");
  const users = useUsers(search.trim());
  const setRole = useSetRole();
  const toggleable: AppRole[] = ["teacher", "admin"];

  return (
    <section className="stack">
      <Field label={t("admin.users.search")}>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
      </Field>
      <ErrorBanner error={users.error ?? setRole.error} />
      {users.isPending ? (
        <Spinner label={t("common.loading")} />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{t("admin.users.user")}</th>
              <th scope="col">{t("admin.users.joined")}</th>
              {toggleable.map((r) => (
                <th key={r} scope="col">
                  {t(`roles.${r}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.data?.map((u) => (
              <tr key={u.user_id}>
                <td>
                  {u.display_name}
                  <div className="small muted">{u.email}</div>
                </td>
                <td>{formatDate(u.created_at)}</td>
                {toggleable.map((role) => {
                  const has = u.roles.includes(role);
                  const self = u.user_id === me?.id && role === "admin";
                  return (
                    <td key={role}>
                      <input
                        type="checkbox"
                        checked={has}
                        disabled={setRole.isPending || self}
                        aria-label={t("admin.users.toggle_role", { role: t(`roles.${role}`), name: u.display_name })}
                        onChange={() => setRole.mutate({ userId: u.user_id, role, enabled: !has })}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function InviteTab() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const invite = useInviteTeacher();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    invite.mutate(email.trim(), { onSuccess: () => setEmail("") });
  };

  return (
    <form className="stack narrow-form" onSubmit={submit}>
      <p className="muted">{t("admin.invite.hint")}</p>
      <ErrorBanner error={invite.error} />
      {invite.isSuccess && <Notice tone="success">{t(invite.data === "invited" ? "admin.invite.sent" : "admin.invite.granted")}</Notice>}
      <Field label={t("auth.email")}>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <div>
        <Button type="submit" variant="primary" busy={invite.isPending}>
          {t("admin.invite.submit")}
        </Button>
      </div>
    </form>
  );
}

export function AdminPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("reports");
  return (
    <div className="container stack-lg">
      <h1>{t("admin.title")}</h1>
      <div role="tablist" className="tabs">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            type="button"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            className={`tab ${tab === id ? "is-active" : ""}`}
            onClick={() => setTab(id)}
          >
            {t(`admin.tabs.${id}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "reports" && <ReportsTab />}
        {tab === "hidden" && <HiddenTab />}
        {tab === "users" && <UsersTab />}
        {tab === "invite" && <InviteTab />}
      </div>
    </div>
  );
}
