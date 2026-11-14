import { InstitutionLogo } from "@/components/maal/InstitutionLogo";

// Onboarding step after a successful bank connection.
// Figma lYCk0dAcbGQGZt96GzU9ui frame 12 ("Account linked"): one card per
// institution (logo, name, green live dot, the account types under it), then
// "Link another account", and Continue pinned near the bottom with a short
// note about read-only access.

export type LinkedAccount = { id: string | number; institution_name?: string; institution_type?: string };

type Group = { name: string; types: string[] };

function groupByInstitution(accounts: LinkedAccount[]): Group[] {
  const map = new Map<string, Group>();
  for (const a of accounts) {
    const name = (a.institution_name || "Your bank").trim();
    const g = map.get(name) ?? { name, types: [] };
    const t = (a.institution_type || "").trim();
    if (t && !g.types.includes(t)) g.types.push(t);
    map.set(name, g);
  }
  return [...map.values()];
}

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function LinkedAccountsStep({
  firstName,
  accounts,
  syncedCount,
  onLinkAnother,
  onContinue,
}: {
  firstName: string;
  accounts: LinkedAccount[];
  syncedCount: number;
  onLinkAnother: () => void;
  onContinue: () => void;
}) {
  const groups = groupByInstitution(accounts);
  const total = accounts.length || syncedCount;
  const what = groups.length === 1
    ? groups[0].name
    : `${total} account${total === 1 ? "" : "s"}`;

  return (
    <div className="wl-col wl-col-wide wl-linked-col">
      <div>
        <h1 className="wl-h1">Nice work{firstName ? `, ${firstName}` : ""}. You’ve successfully linked {what}.</h1>
        <p className="wl-sub">Link more accounts for a fuller picture, or start exploring Maal.</p>
        <ul className="wl-linked" aria-label="Linked accounts">
          {groups.length ? groups.slice(0, 6).map((g) => (
            <li key={g.name} className="wl-linked-row">
              <InstitutionLogo name={g.name} size={34} />
              <div style={{ minWidth: 0 }}>
                <p className="wl-linked-name">{g.name} <span className="wl-dot" aria-label="Connected" /></p>
                <p className="wl-muted">{g.types.length ? joinAnd(g.types) : "Connected"}</p>
              </div>
            </li>
          )) : (
            <li className="wl-linked-row">
              <span className="wl-dot" aria-hidden="true" />
              <p>{syncedCount} account{syncedCount === 1 ? "" : "s"} synced from your bank</p>
            </li>
          )}
        </ul>
        <button type="button" className="v2-btn v2-btn-line v2-btn-block wl-cta" onClick={onLinkAnother}>Link another account</button>
      </div>

      <div className="wl-linked-foot">
        <p className="wl-fine">Maal has read-only access through Australia’s Consumer Data Right, so it can see your balances and transactions but can’t move your money.</p>
        <button type="button" className="v2-btn v2-btn-ink v2-btn-lg v2-btn-block" onClick={onContinue}>Continue</button>
      </div>
    </div>
  );
}
