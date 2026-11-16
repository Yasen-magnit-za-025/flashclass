import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { meQueryKey, useSession } from "@/app/session";
import { Badge, Button, ErrorBanner, Field, Notice, PageLoader } from "@/components/ui";
import { SCHOOL_GRADES } from "@/domain/taxonomy";
import { useI18n } from "@/i18n/I18nProvider";
import { unwrap } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

export function ProfilePage() {
  const { t } = useI18n();
  const { user, profile, roles } = useSession();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [displayName, setDisplayName] = useState("");
  const [grade, setGrade] = useState<string>("");

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
      setGrade(profile.grade_preference ?? "");
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await supabase
          .from("profiles")
          .update({ display_name: displayName.trim(), grade_preference: grade || null })
          .eq("user_id", user!.id)
          .select()
          .single(),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meQueryKey(user?.id) }),
  });

  if (!profile || !user) return <PageLoader />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <div className="container narrow">
      <h1>{t("profile.title")}</h1>
      {params.get("passwordChanged") && <Notice tone="success">{t("auth.reset.done")}</Notice>}
      <p className="muted">
        {user.email} ·{" "}
        {[...roles].map((r) => (
          <Badge key={r} tone={r === "student" ? "neutral" : "accent"}>
            {t(`roles.${r}`)}
          </Badge>
        ))}
      </p>

      <form className="card stack" onSubmit={submit}>
        <ErrorBanner error={save.error} />
        {save.isSuccess && <Notice tone="success">{t("common.saved")}</Notice>}
        <Field label={t("profile.display_name")} hint={t("profile.display_name.hint")}>
          <input required maxLength={60} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label={t("profile.grade")} hint={t("profile.grade.hint")}>
          <select value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">{t("profile.grade.none")}</option>
            {SCHOOL_GRADES.map((g) => (
              <option key={g} value={String(g)}>
                {t("levels.grade", { grade: g })}
              </option>
            ))}
            <option value="other">{t("profile.grade.other")}</option>
          </select>
        </Field>
        <div className="row">
          <Button type="submit" variant="primary" busy={save.isPending}>
            {t("common.save")}
          </Button>
        </div>
      </form>

      <section className="card stack">
        <h2>{t("profile.security")}</h2>
        <Link to="/auth/reset">{t("profile.change_password")}</Link>
      </section>

      <section className="card stack">
        <h2>{t("profile.privacy.title")}</h2>
        <p className="muted">{t("profile.privacy.body")}</p>
      </section>
    </div>
  );
}
