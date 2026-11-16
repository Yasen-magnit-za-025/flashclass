import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, ScrollRestoration, useNavigate } from "react-router-dom";
import { UI_LOCALES, type UiLocale } from "@/domain/taxonomy";
import { signOut } from "@/features/auth/signOut";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/lib/supabase";
import { meQueryKey, useSession } from "./session";

/** Adopts the profile's UI locale once after sign-in; afterwards the switcher writes it back. */
function useProfileLocaleSync() {
  const { profile } = useSession();
  const { setLocale } = useI18n();
  const syncedFor = useRef<string | null>(null);
  useEffect(() => {
    if (profile && syncedFor.current !== profile.user_id) {
      syncedFor.current = profile.user_id;
      setLocale(profile.ui_locale);
    }
  }, [profile, setLocale]);
}

function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const { user } = useSession();
  const queryClient = useQueryClient();

  const change = async (next: UiLocale) => {
    setLocale(next);
    if (user) {
      await supabase.from("profiles").update({ ui_locale: next }).eq("user_id", user.id);
      void queryClient.invalidateQueries({ queryKey: meQueryKey(user.id) });
    }
  };

  return (
    <label className="locale-switcher">
      <span className="visually-hidden">{t("nav.language")}</span>
      <select value={locale} onChange={(e) => void change(e.target.value as UiLocale)}>
        {UI_LOCALES.map((l) => (
          <option key={l} value={l}>
            {l === "bg" ? "Български" : "English"}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Layout() {
  const { t } = useI18n();
  const { status, profile, isTeacher, isAdmin } = useSession();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  useProfileLocaleSync();

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        {t("nav.skip_to_content")}
      </a>
      <header className="app-header">
        <div className="container header-inner">
          <Link to="/" className="brand">
            <img src="/favicon.svg" alt="" width={24} height={24} />
            FlashClass
          </Link>
          {status === "signedIn" && (
            <nav aria-label={t("nav.main")} className="main-nav">
              <NavLink to="/library">{t("nav.library")}</NavLink>
              <NavLink to="/saved">{t("nav.saved")}</NavLink>
              <NavLink to="/progress">{t("nav.progress")}</NavLink>
              {isTeacher && <NavLink to="/teach">{t("nav.teach")}</NavLink>}
              {isAdmin && <NavLink to="/admin">{t("nav.admin")}</NavLink>}
            </nav>
          )}
          <div className="header-actions">
            <LocaleSwitcher />
            {status === "signedIn" ? (
              <>
                <NavLink to="/profile" className="profile-link">
                  {profile?.display_name ?? t("nav.profile")}
                </NavLink>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={signingOut}
                  aria-busy={signingOut || undefined}
                  onClick={() => {
                    setSigningOut(true);
                    void signOut().finally(() => {
                      setSigningOut(false);
                      navigate("/auth/sign-in?signedOut=1", { replace: true });
                    });
                  }}
                >
                  {t("nav.sign_out")}
                </button>
              </>
            ) : status === "signedOut" ? (
              <Link to="/auth/sign-in" className="btn btn-primary">
                {t("nav.sign_in")}
              </Link>
            ) : null}
          </div>
        </div>
      </header>
      <main id="main" className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        <div className="container footer-inner">
          <span>© FlashClass</span>
          <Link to="/privacy">{t("nav.privacy")}</Link>
        </div>
      </footer>
      <ScrollRestoration />
    </div>
  );
}
