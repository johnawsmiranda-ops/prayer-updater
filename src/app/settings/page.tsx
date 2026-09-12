import { getNeedsReviewThreshold } from "@/lib/needsReview";
import { logoutAction } from "@/lib/actions/auth";

export default async function SettingsPage() {
  const threshold = getNeedsReviewThreshold();

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="font-[family-name:var(--font-app-serif)] text-2xl font-semibold text-[var(--accent-strong)]">
        Settings
      </h1>

      <section className="card p-5">
        <h2 className="text-sm font-semibold mb-2">Needs Review threshold</h2>
        <p className="text-sm text-[var(--muted)] mb-2">
          An active prayer is flagged &ldquo;Needs Review&rdquo; once it has gone this many days without being
          edited or having its status changed. Nothing is ever removed automatically — this is just a nudge.
        </p>
        <p className="text-sm">
          Current threshold: <strong>{threshold} days</strong>
        </p>
        <p className="text-xs text-[var(--muted)] mt-2">
          To change it, set <code className="font-mono">NEXT_PUBLIC_NEEDS_REVIEW_DAYS</code> in your environment
          variables and redeploy.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold mb-2">Canva integration</h2>
        <p className="text-sm text-[var(--muted)] mb-2">
          Manage the Canva connection, template, and field mapping from the Canva tab in the main navigation.
        </p>
        <a href="/canva" className="btn btn-secondary">
          Go to Canva settings →
        </a>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold mb-2">Admin account</h2>
        <p className="text-sm text-[var(--muted)] mb-3">
          This app has a single administrator account, protected by the <code className="font-mono">ADMIN_PASSWORD</code>{" "}
          environment variable. To change the password, update that variable and redeploy.
        </p>
        <form action={logoutAction}>
          <button type="submit" className="btn btn-secondary">
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}
