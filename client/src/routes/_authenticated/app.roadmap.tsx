import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles, ArrowUp, ThumbsUp, Circle } from "lucide-react";
import { z } from "zod";

const searchSchema = z.object({
  tab: z.enum(["changelog", "roadmap"]).optional(),
});

export const Route = createFileRoute("/_authenticated/app/roadmap")({
  component: RoadmapPage,
  validateSearch: searchSchema,
});

type ChangelogItem = {
  kind: "feature" | "improvement";
  title: string;
  body: string;
  date: string;
  votes: number;
};

// Compute the relative age ("14d", "1mo") from the item's date at render time
// so labels stay accurate as the current date moves instead of going stale.
function relativeAge(dateStr: string): string {
  const then = new Date(dateStr).getTime();
  if (!Number.isFinite(then)) return "";
  const days = Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
  if (days < 1) return "today";
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

const CHANGELOG: ChangelogItem[] = [
  { kind: "feature", title: "Custom Reports Delivered to Your Inbox", body: "Available on Pro and Max. Maal can now build any file you ask for and email it to you as an attachment. Ask her to put together a financial model in Excel, a portfolio rebalance plan as a PDF, a tax-loss harvesting summary, or any custom report, and she does the work in chat then delivers the file straight to your inbox. Just say \"build me a financial model in Excel and send it to my email,\" and it lands in your inbox a moment later.", date: "Jun 5, 2026", votes: 24 },
  { kind: "feature", title: "Voice Notes via SMS", body: "Send Maal a voice note from your phone and she will transcribe and respond to it like any other message. Faster than typing when you are on the go. Works on any iPhone or Android, just record and send to Maal's number like you would with any contact.", date: "Jun 3, 2026", votes: 14 },
  { kind: "improvement", title: "Improvement", body: "If you start typing a message and click away, refresh the page, or get redirected, your draft is now saved automatically and waiting for you when you return. No more retyping a question you already wrote out in Ask Maal.", date: "Jun 2, 2026", votes: 17 },
  { kind: "improvement", title: "Improvement", body: "A quick \"Add asset or liability\" button now lives on the dashboard so you can drop in a new property, account, or holding without hunting through Portfolio settings.", date: "Jun 1, 2026", votes: 9 },
  { kind: "improvement", title: "Improvement", body: "Maal now keeps long conversations running smoothly. When a chat gets too long to fit her working memory, she automatically summarizes what you have discussed and continues in a fresh session with full context carried over, so you never lose your place in a deep research thread.", date: "May 27, 2026", votes: 12 },
  { kind: "feature", title: "Inline Source Citations", body: "Maal now cites her sources inline as she writes. Clickable source pills appear at the end of each cited sentence so you can see exactly where the information came from. Every message also has a Sources widget that lists everything she referenced in one place.", date: "May 13, 2026", votes: 48 },
  { kind: "feature", title: "CSV Uploads in Chat", body: "You can now upload CSV files directly to Maal and ask her to analyze them. Useful for transaction exports, custom holdings lists, or any tabular data you want her to reason over.", date: "May 12, 2026", votes: 44 },
  { kind: "improvement", title: "Improvement", body: "Cleaned up Radar email previews, SMS summaries, and inbound email replies so notifications read clean and human, with no leftover formatting markup.", date: "May 9, 2026", votes: 25 },
];

type RoadmapItem = { title: string; body: string; votes: number; category: string };

const ROADMAP: RoadmapItem[] = [
  { title: "Mobile App", body: "Access your portfolio on the go with our native mobile application.", votes: 823, category: "Apps" },
  { title: "Anonymous Peer Benchmarking", body: "Compare your financial performance to anonymized data from similar Maal users. See how your spending, saving, and investing habits stack up against others in your income bracket, age group, or location without compromising anyone's privacy.", votes: 375, category: "Insights" },
  { title: "Personalized Financial Task Advice", body: "Receive tailored recommendations for financial tasks based on your unique situation. Maal analyzes your portfolio patterns and suggests specific actions to optimize your finances, like rebalancing investments, refinancing loans, or adjusting budget allocations.", votes: 351, category: "Advisor" },
  { title: "P&L Reports", body: "Generate detailed profit and loss statements across all your financial activities.", votes: 276, category: "Reports" },
  { title: "Multi-user Access", body: "Share financial insights with family members, business partners, or financial advisors with granular permission controls.", votes: 242, category: "Collaboration" },
  { title: "Custom Dashboard Widgets", body: "Create a dashboard that shows exactly what matters to you.", votes: 207, category: "Dashboard" },
  { title: "Maal Action Commands", body: "Enhance Maal's capabilities to perform direct actions through chat commands. Ask Maal to add new assets, categorize transactions, upload documents, generate reports, or create budgets - all through natural conversation.", votes: 138, category: "Advisor" },
  { title: "Community Prompt Library", body: "Discover and explore a collection of suggested prompts from the Maal user community. The Prompt Library page makes it easy to find inspiration and try out new ways to interact with Maal.", votes: 137, category: "Community" },
  { title: "My Prompts", body: "Save your favorite prompts for quick access. This feature lets you organize your most useful prompts for future use with Maal.", votes: 120, category: "Advisor" },
  { title: "Group/Entity Asset Management", body: "Manage assets across multiple entities, trusts, or business structures in a single view.", votes: 98, category: "Portfolio" },
];

function RoadmapPage() {
  const search = useSearch({ from: "/_authenticated/app/roadmap" });
  const tab = search.tab ?? "changelog";
  const [filter, setFilter] = useState<string>("All");
  const [votes, setVotes] = useState<Record<string, number>>({});

  const categories = ["All", ...Array.from(new Set(ROADMAP.map((r) => r.category)))];
  const filtered = filter === "All" ? ROADMAP : ROADMAP.filter((r) => r.category === filter);

  function toggleVote(key: string) {
    setVotes((v) => ({ ...v, [key]: v[key] ? 0 : 1 }));
  }

  return (
    <div className="max-w-4xl mx-auto px-6 md:px-10 py-10">
      <h1 className="text-[28px] tracking-display font-bold">Product Updates</h1>
      <p className="text-[13px] text-muted-foreground mt-1">
        Stay up to date on our latest changes and upcoming features, and upvote those that you're most excited for
      </p>

      <div className="mt-6 inline-flex items-center p-1 bg-[var(--secondary)] rounded-[10px] w-full grid grid-cols-2">
        <Link
          to="/app/roadmap"
          search={{ tab: "changelog" }}
          className={`text-center px-4 py-2 rounded-[8px] text-[13px] font-medium transition-colors ${
            tab === "changelog" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Changelog
        </Link>
        <Link
          to="/app/roadmap"
          search={{ tab: "roadmap" }}
          className={`text-center px-4 py-2 rounded-[8px] text-[13px] font-medium transition-colors ${
            tab === "roadmap" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Roadmap
        </Link>
      </div>

      {tab === "changelog" ? (
        <div className="mt-5 space-y-3">
          {CHANGELOG.map((c, i) => {
            const key = `c-${i}`;
            const voted = votes[key] === 1;
            const total = c.votes + (voted ? 1 : 0);
            return (
              <article key={key} className="border border-border rounded-[12px] bg-[var(--surface)] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2">
                    {c.kind === "feature" ? (
                      <Sparkles className="size-4 text-mint" />
                    ) : (
                      <ArrowUp className="size-4 text-muted-foreground" />
                    )}
                    <h3 className="text-[14px] font-semibold">
                      {c.title}
                      {c.kind === "feature" && (
                        <span className="ml-2 text-[10px] uppercase tracking-[0.12em] text-mint font-medium">Feature</span>
                      )}
                    </h3>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">{relativeAge(c.date)}</span>
                </div>
                <p className="mt-3 text-[13px] text-muted-foreground leading-relaxed">{c.body}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{c.date}</span>
                  <button
                    onClick={() => toggleVote(key)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[11px] font-medium border transition-colors ${
                      voted
                        ? "bg-mint/15 text-mint border-mint/30"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ThumbsUp className="size-3" /> +{total}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-5">
          <div className="flex justify-end mb-3">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="text-[12px] bg-background border border-border rounded-[8px] px-2.5 py-1.5"
            >
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-3">
            {filtered.map((r, i) => {
              const key = `r-${r.title}`;
              const voted = votes[key] === 1;
              const total = r.votes + (voted ? 1 : 0);
              return (
                <article key={key} className="border border-border rounded-[12px] bg-[var(--surface)] p-5">
                  <div className="flex items-center gap-2">
                    <Circle className="size-3 text-muted-foreground" />
                    <h3 className="text-[14px] font-semibold">{r.title}</h3>
                    <span className="ml-auto text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{r.category}</span>
                  </div>
                  <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">{r.body}</p>
                  <div className="mt-4">
                    <button
                      onClick={() => toggleVote(key)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[11px] font-medium border transition-colors ${
                        voted
                          ? "bg-mint/15 text-mint border-mint/30"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <ThumbsUp className="size-3" /> +{total}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}