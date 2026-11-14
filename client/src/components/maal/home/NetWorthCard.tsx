import { useMemo, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import { MoreVertical, RefreshCw, EyeOff, Eye, ListFilter, Settings, ChevronRight, ShieldOff, Shield } from "lucide-react";
import type { Snapshot } from "@/lib/snapshots";
import {
  RANGES, filteredSeries, filteredTotals, isPartialSelection, seriesChange, sliceSeries,
  type HomeAccount, type HomeRange,
} from "../../../../../shared/home-accounts.mjs";
import { AreaChart } from "./AreaChart";
import { AccountFilter } from "./AccountFilter";
import { AskSparkButton } from "./HomeCard";
import { aud, pctText, signedCents } from "./format";
import {
  setAccountFilter, setGraphHidden, setPrivacy, useAccountFilter, useGraphHidden, usePrivacy,
} from "./prefs";

/** Where "Add account" goes — the bank/super connect flow. */
export const CONNECT_PATH = "/app/accounts/connect";

export function NetWorthCard({
  accounts, snapshots, loading, error, onRefresh,
}: {
  accounts: HomeAccount[];
  snapshots: Snapshot[];
  loading: boolean;
  error?: boolean;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const [range, setRange] = useState<HomeRange>("1W");
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const privacy = usePrivacy();
  const graphHidden = useGraphHidden();
  const storedFilter = useAccountFilter();

  // Drop ids for accounts that no longer exist; an empty result means "all".
  const selected = useMemo(() => {
    if (!storedFilter) return null;
    const known = storedFilter.filter((id) => accounts.some((a) => a.id === id));
    return known.length ? known : null;
  }, [storedFilter, accounts]);
  const filtered = isPartialSelection(accounts, selected);

  const totals = useMemo(() => filteredTotals(accounts, selected), [accounts, selected]);
  const series = useMemo(() => filteredSeries(snapshots, accounts, selected), [snapshots, accounts, selected]);
  const visible = useMemo(() => {
    const s = sliceSeries(series, range);
    // Snapshots are captured daily; pin the last point to today's live total
    // so the line always ends on the headline figure.
    if (s.length) s[s.length - 1] = { ...s[s.length - 1], value: totals.netWorth };
    return s;
  }, [series, range, totals.netWorth]);
  const { change, pct } = seriesChange(visible);
  const tone = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const hasAccounts = accounts.length > 0;
  const flag = privacy || filtered || graphHidden;

  function addAccount() {
    router.history.push(CONNECT_PATH);
  }

  const deltaText = `${signedCents(change)}${pct === null ? (change === 0 ? " (0%)" : "") : pctText(pct)}`;

  return (
    <section className="mh-card" aria-labelledby="mh-nw-label">
      <Popover.Root open={filterOpen} onOpenChange={setFilterOpen}>
        <div className="mh-card-head">
          <Link to="/app/assets" search={{ add: undefined }} className="mh-card-label" id="mh-nw-label">
            Net worth{filtered ? " · filtered" : ""}<ChevronRight aria-hidden />
          </Link>
          <Popover.Anchor asChild>
            <div className="mh-card-actions">
              <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenu.Trigger asChild>
                  <button type="button" className="mh-dots" data-flag={flag} aria-label="Net worth options">
                    <MoreVertical className="size-5" aria-hidden />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={8} className="mh mh-menu">
                    <DropdownMenu.Item className="mh-menu-item" onSelect={onRefresh}>
                      <RefreshCw aria-hidden /> Refresh
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className="mh-menu-item" onSelect={() => setPrivacy(!privacy)}>
                      {privacy ? <Shield aria-hidden /> : <ShieldOff aria-hidden />}
                      {privacy ? "Turn off privacy" : "Turn on privacy"}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className="mh-menu-item" onSelect={() => setGraphHidden(!graphHidden)}>
                      {graphHidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
                      {graphHidden ? "Show graph" : "Hide graph"}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className="mh-menu-item" disabled={!hasAccounts}
                      onSelect={() => { setMenuOpen(false); setTimeout(() => setFilterOpen(true), 0); }}>
                      <ListFilter aria-hidden /> Filter accounts
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className="mh-menu-item" asChild>
                      <Link to="/app/assets" search={{ add: undefined }}><Settings aria-hidden /> Manage accounts</Link>
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <AskSparkButton label="Ask Maal about your net worth"
                question="Explain how my net worth has changed recently and what's driving it." />
            </div>
          </Popover.Anchor>
          <Popover.Portal>
            <Popover.Content align="end" sideOffset={8} className="mh mh-menu mh-filter"
              onOpenAutoFocus={(e) => e.preventDefault()}>
              <AccountFilter
                accounts={accounts}
                selected={selected}
                onApply={(ids) => { setAccountFilter(ids); setFilterOpen(false); }}
                onClear={() => { setAccountFilter(null); setFilterOpen(false); }}
              />
            </Popover.Content>
          </Popover.Portal>
        </div>
      </Popover.Root>

      <div className="mh-card-body" style={{ paddingBottom: 22 }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {loading && !hasAccounts ? (
              <>
                <div className="mh-skel" style={{ width: 140, height: 38 }} />
                <div className="mh-skel mt-2" style={{ width: 160, height: 16 }} />
              </>
            ) : error && !hasAccounts ? (
              <>
                <p className="mh-big">—</p>
                <p className="mh-delta" data-tone="flat">
                  Balances couldn’t load. <button className="mh-link-btn" onClick={onRefresh} style={{ fontSize: 15 }}>Try again</button>
                </p>
              </>
            ) : privacy ? (
              // Privacy mode: the balance is hidden; only the movement shows.
              <>
                <p className="mh-big mh-delta" data-tone={tone} style={{ marginTop: 0 }}>{deltaText}</p>
                <p className="sr-only">Net worth hidden while privacy mode is on.</p>
              </>
            ) : (
              <>
                <p className="mh-big mh-amount" aria-live="polite">{aud(totals.netWorth)}</p>
                <p className="mh-delta" data-tone={tone}>
                  {deltaText}
                  <span className="sr-only"> over {range === "ALL" ? "all time" : range}</span>
                </p>
              </>
            )}
          </div>
          <Link to="/app/retirement" className="mh-btn-outline shrink-0">
            Forecast <ChevronRight aria-hidden />
          </Link>
        </div>

        {!graphHidden && (
          <>
            <AreaChart
              label={filtered ? "Net worth for selected accounts" : "Net worth"}
              points={visible}
              emptyMessage={
                hasAccounts
                  ? "Maal records your balance once a day. Your graph fills in over the next few days."
                  : "Add an account to start tracking your net worth here."
              }
            />
            <div className="mh-ranges" role="group" aria-label="Chart range">
              {RANGES.map((r) => (
                <button key={r} type="button" className="mh-range" aria-pressed={range === r} onClick={() => setRange(r)}>
                  {r}
                </button>
              ))}
            </div>
            {filtered && (
              <p className="mh-faint mh-small -mt-2 mb-4 text-center">
                Showing {selected?.length} of {accounts.length} accounts. History for part-selected categories is scaled from category totals.
              </p>
            )}
          </>
        )}

        <button type="button" onClick={addAccount} className="mh-btn-outline mh-btn-wide" style={{ marginTop: graphHidden ? 24 : 0 }}>
          Add account
        </button>
      </div>
    </section>
  );
}
