import type { SessionInfo } from "../../../shared/schemas";
import { accountApi, loginHref, type Me } from "./api";

/** Top-bar account state: nothing in guest mode, a sign-in link, or the balance with sign-out. */
export function AccountBar({ session, me, onChanged }: { session: SessionInfo | null; me: Me | null; onChanged: () => void }) {
  if (!session?.accounts.enabled) return null;
  if (!me?.user) {
    return session.accounts.loginAvailable ? (
      <a className="btn glass small" href={loginHref()}>
        <GoogleMark /> تسجيل الدخول
      </a>
    ) : null;
  }
  const b = me.balance;
  return (
    <div className="account">
      {b && (
        <span className="balance-chip" title="رصيد الفحوص">
          <span className="drop" aria-hidden="true" />
          <span>
            <bdi>{b.freeAvailable}</bdi> مجاني
            {b.paidAvailable > 0 && (
              <>
                {" · "}
                <bdi>{b.paidAvailable}</bdi> مدفوع
              </>
            )}
          </span>
        </span>
      )}
      <button
        type="button"
        className="btn ghost small"
        onClick={() => {
          void accountApi.logout().finally(onChanged);
        }}
      >
        خروج
      </button>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.8-2.1 5.1-4.4 6.7v5.6h7.1c4.2-3.8 6.6-9.5 6.6-16.3z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.6c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.8C8.1 41.1 15.5 46 24 46z" />
      <path fill="#FBBC05" d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2V14H4.5C3 17 2 20.4 2 24s1 7 2.5 10l7.3-5.8z" />
      <path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.5 2 8.1 6.9 4.5 14l7.3 5.8c1.7-5.2 6.5-9 12.2-9z" />
    </svg>
  );
}
