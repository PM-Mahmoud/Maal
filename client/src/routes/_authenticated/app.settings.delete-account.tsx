import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Trash2, X } from "lucide-react";
import { DELETE_CONFIRMATION, deleteAccount } from "@/components/maal/settings/api";
import { SettingsToast } from "@/components/maal/settings/parts";

// "Deleting an account from Settings" flow: Delete your account card →
// confirmation dialog → "Your request has been received." → signed out to
// /login. The server (POST /api/account/delete, services/account-deletion.js)
// requires the session plus the typed phrase, cancels any membership first and
// erases every per-user record.
export const Route = createFileRoute("/_authenticated/app/settings/delete-account")({
  head: () => ({ meta: [{ title: "Delete account · Settings · Maal" }] }),
  component: DeleteAccountPage,
});

const REDIRECT_MS = 3500;

function DeleteAccountPage() {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const confirmed = phrase.trim().toUpperCase() === DELETE_CONFIRMATION;

  async function confirmDelete() {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(phrase);
      setOpen(false);
      // The session is gone server-side; the toast leaves for /login when it ends.
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete your account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="mh-card" aria-labelledby="ms-delete">
        <div className="mh-card-head"><h2 id="ms-delete" className="mh-card-label">Delete your account</h2></div>
        <div className="mh-card-body">
          <p className="ms-card-copy">
            Deleting your account permanently removes your financial data from Maal, including linked accounts,
            transactions, goals, documents in your Vault and your conversations with your advisor. You won't be able
            to sign in, create or change anything afterwards.
          </p>
          <ul className="ms-list-plain">
            <li>Any active membership is cancelled at the same time, so you won't be charged again.</li>
            <li>You'll be signed out on every device.</li>
            <li>We'll email you to confirm once it's done.</li>
          </ul>
          <div className="mn-actions" style={{ marginTop: 22 }}>
            <button type="button" className="ms-danger-btn" onClick={() => { setOpen(true); setPhrase(""); setError(null); }} disabled={done}>
              Delete account
            </button>
            <Link to="/app/settings" className="mh-link-btn">Back to settings</Link>
          </div>
        </div>
      </section>

      <Dialog.Root open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="ms-overlay" />
          <Dialog.Content className="mh ms-dialog" style={{ width: "min(720px, calc(100vw - 32px))" }}>
            <div className="ms-dialog-head">
              <p className="ms-dialog-kicker">Deleting your Maal account</p>
              <Dialog.Close className="mh-close" aria-label="Close" disabled={busy}><X className="size-4" /></Dialog.Close>
            </div>
            <form className="ms-dialog-body" onSubmit={(e) => { e.preventDefault(); void confirmDelete(); }}>
              <Dialog.Title className="ms-dialog-title ms-dialog-title--sans">
                Are you sure you want to delete your Maal account?
              </Dialog.Title>
              <Dialog.Description className="ms-dialog-text">
                This can't be undone. Your financial data will be permanently erased and you'll lose access to
                everything in Maal.
              </Dialog.Description>
              <p className="ms-dialog-text">
                If you have an active membership, it will be cancelled as part of the deletion. We'll send a
                confirmation to your email once it's complete.
              </p>
              <label htmlFor="ms-delete-phrase" className="block text-[14px] mb-1.5">
                Type <strong>{DELETE_CONFIRMATION}</strong> to confirm
              </label>
              <div className="ms-field ms-confirm-input" data-filled={!!phrase} data-invalid={!!error}>
                <input id="ms-delete-phrase" className="ms-input" style={{ padding: "0 14px" }} value={phrase} autoComplete="off"
                  autoCapitalize="characters" spellCheck={false} onChange={(e) => setPhrase(e.target.value)} disabled={busy} />
              </div>
              {error && <p className="ms-err" role="alert">{error}</p>}
              <div className="ms-dialog-actions">
                <Dialog.Close asChild>
                  <button type="button" className="mh-btn-outline" disabled={busy}>Cancel</button>
                </Dialog.Close>
                <button type="submit" className="ms-danger-btn ms-danger-btn--solid" disabled={!confirmed || busy}>
                  <Trash2 className="size-4" aria-hidden /> {busy ? "Deleting…" : "Delete account"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {done && (
        <SettingsToast
          title="Success"
          sub="Your request has been received. Signing you out…"
          ms={REDIRECT_MS}
          onDismiss={() => window.location.assign("/login")}
        />
      )}
    </>
  );
}
