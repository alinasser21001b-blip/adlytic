import { useCallback, useEffect, useState } from "react";
import type { AnalysisReport, SessionInfo } from "../../shared/schemas";
import { api, ApiFailure } from "../features/check/api";
import { CheckForm } from "../features/check/CheckForm";
import { ResultView } from "../features/check/ResultView";
import { t } from "../i18n/ar";
import { PrivacyPage, TermsPage } from "./Legal";

type Route = { name: "home" } | { name: "report"; id: string } | { name: "privacy" } | { name: "terms" };

function parseRoute(path: string): Route {
  const m = path.match(/^\/r\/([A-Za-z0-9_-]{8,64})\/?$/);
  if (m) return { name: "report", id: m[1]! };
  if (path === "/privacy") return { name: "privacy" };
  if (path === "/terms") return { name: "terms" };
  return { name: "home" };
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.pathname));
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [result, setResult] = useState<{ report: AnalysisReport; previewUrl: string | null; shareActive: boolean } | null>(null);
  const [reportState, setReportState] = useState<"idle" | "loading" | "gone">("idle");

  const refreshSession = useCallback(() => {
    api
      .session()
      .then((s) => {
        setSession(s);
        setSessionError(null);
      })
      .catch((e) => setSessionError(e instanceof ApiFailure ? e.message : "تعذّر الاتصال بالخدمة. حدّث الصفحة."));
  }, []);

  useEffect(() => {
    refreshSession();
    const onPop = () => setRoute(parseRoute(location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [refreshSession]);

  // Opening /r/:id fetches the owner's stored report — never re-runs the analysis.
  useEffect(() => {
    if (route.name !== "report" || result?.report.id === route.id) return;
    setReportState("loading");
    api
      .report(route.id)
      .then(({ report, share }) => {
        setResult({ report, previewUrl: null, shareActive: share.active });
        setReportState("idle");
      })
      .catch(() => setReportState("gone"));
  }, [route, result]);

  function go(path: string) {
    history.pushState(null, "", path);
    setRoute(parseRoute(path));
    window.scrollTo({ top: 0 });
  }

  function onDone(report: AnalysisReport, previewUrl: string | null) {
    setResult({ report, previewUrl, shareActive: false });
    history.pushState(null, "", `/r/${report.id}`);
    setRoute({ name: "report", id: report.id });
    refreshSession();
    requestAnimationFrame(() => document.getElementById("result-title")?.focus());
    window.scrollTo({ top: 0 });
  }

  function newCheck() {
    if (result?.previewUrl) URL.revokeObjectURL(result.previewUrl);
    setResult(null);
    api.event("new_check_started");
    go("/");
    requestAnimationFrame(() => document.getElementById("check")?.scrollIntoView({ block: "start" }));
  }

  return (
    <>
      <a className="skip" href="#main">
        انتقل إلى المحتوى
      </a>
      <header className="topbar">
        <a href="/" className="logo" onClick={(e) => (e.preventDefault(), go("/"))}>
          <span className="logo-mark" aria-hidden="true" />
          {t.brand}
        </a>
      </header>
      <main id="main" tabIndex={-1}>
        {route.name === "privacy" && <PrivacyPage />}
        {route.name === "terms" && <TermsPage />}
        {route.name === "report" &&
          (result && result.report.id === route.id ? (
            <ResultView
              report={result.report}
              previewUrl={result.previewUrl}
              shareActive={result.shareActive}
              onNewCheck={newCheck}
              onDeleted={() => {
                setResult(null);
                go("/");
              }}
            />
          ) : (
            <div className="card center">
              <p role="status">{reportState === "gone" ? t.reportGone : t.loadingReport}</p>
              {reportState === "gone" && (
                <button type="button" className="btn primary" onClick={newCheck}>
                  {t.newCheck}
                </button>
              )}
            </div>
          ))}
        {route.name === "home" && (
          <div className="home">
            <section className="hero" aria-labelledby="hero-title">
              <h1 id="hero-title">{t.heroTitle}</h1>
              <p className="lead">{t.heroLead}</p>
              <ul className="gets">
                {t.whatYouGet.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
              <a
                href="#check"
                className="btn primary hero-cta"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById("check")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
                }}
              >
                {t.heroCta}
              </a>
              <p className="hero-note">{t.heroNote}</p>
            </section>
            <div>
              {sessionError && (
                <p className="form-error" role="alert">
                  {sessionError}
                </p>
              )}
              {session ? <CheckForm session={session} onDone={onDone} onQuotaChanged={refreshSession} /> : !sessionError && <div className="card skeleton" aria-hidden="true" />}
            </div>
          </div>
        )}
      </main>
      <footer className="site-footer">
        <a href="/privacy" onClick={(e) => (e.preventDefault(), go("/privacy"))}>
          {t.footerPrivacy}
        </a>
        <a href="/terms" onClick={(e) => (e.preventDefault(), go("/terms"))}>
          {t.footerTerms}
        </a>
        <span>Adlytic Check</span>
      </footer>
    </>
  );
}
