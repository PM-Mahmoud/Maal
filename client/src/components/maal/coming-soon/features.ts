// Per-feature config for the shared ComingSoonPage (v3, 2026-11-23).
// Copy rules: Maal's own words, Australian English, no dates, no prices, no
// provider or partner names, never claim the feature exists yet. Credit score
// copy must not suggest Maal offers credit or loans. Estate planning uses
// Australian terms only. `key` is what POST /feedback records as
// `[service-interest] <key>` and names the optional hero photo
// client/public/images/coming-soon/<key>.jpg.

import {
  Gauge, Lightbulb, ShieldCheck, CalendarClock, ChartColumn, Receipt, ScrollText, Users, FolderLock,
  Target, MessageCircle, ListChecks, FileText, CalendarCheck, ScanSearch, BellRing, KeyRound,
  UserRound, Share2, type LucideIcon,
} from "lucide-react";

export type ComingSoonKey =
  | "credit-score" | "equity" | "estate-planning" | "financial-planner" | "tax" | "id-protection" | "cfp-sessions";

export type Benefit = { icon: LucideIcon; title: string; text: string };
export type Faq = { q: string; a: string };
/** Hero texture mood: deep base + three tones for the CSS fallback texture. */
export type Mood = { base: string; a: string; b: string; c: string };

export type Photo = {
  /** Intrinsic size of the 1600w file (the 900w file keeps the same ratio). */
  width: number; height: number;
  /** CSS object-position focal point. */
  position?: string;
  credit: { name: string; url: string };
};

export type Session = { length: string; blurb: string; points: string[] };
export type Plan = { name: string; blurb: string; points: { label: string; included: boolean }[] };
export type TableSection = { label: string; rows: { label: string; cells: boolean[] }[] };

export type Preview =
  | { kind: "credit"; score: number; band: string; marker: number; change: string }
  | { kind: "equity"; company: string; price: string; valuation: string; grants: { name: string; type: string; total: string; vested: string }[] }
  | { kind: "sessions"; sessions: Session[] }
  | { kind: "plans"; plans: Plan[] }
  | { kind: "tax"; year: string; rows: { label: string; value: string; strong?: boolean }[]; note: string }
  | { kind: "id"; rows: { item: string; status: string; alert?: boolean }[] };

export type ComingSoonFeature = {
  key: ComingSoonKey;
  /** Page title in the header bar. */
  title: string;
  /** Lora headline: `italic` is the first word, set in italic. */
  headline: { italic: string; rest: string };
  /** Supporting text, shown as two lines on wide screens. */
  lines: [string, string];
  /** Small reassurance line under the button. */
  reassurance: string;
  mood: Mood;
  /** Hero photo (client/public/images/coming-soon/<key>.jpg + <key>-900.jpg), Unsplash Licence. */
  photo: Photo;
  preview: Preview;
  benefits: [Benefit, Benefit, Benefit];
  /** Estate planning only: tier comparison. */
  table?: { columns: string[]; sections: TableSection[] };
  faqs: Faq[];
};

const LAUNCH: Faq = {
  q: "When will it be ready?",
  a: "We don't have a date to share yet. Tap Coming soon and we'll let you know as soon as it's ready.",
};
const COST: Faq = {
  q: "What will it cost?",
  a: "Pricing will be shared before launch. Joining the waitlist is free and doesn't commit you to anything.",
};
const dataFaq = (what: string): Faq => ({
  q: "How will my data be handled?",
  a: `Only the details you choose to share would be used, and only to ${what}. We'll set out exactly how before launch.`,
});
const FREE = "Free to join the waitlist.";

const SESSION_PREVIEW: Preview = {
  kind: "sessions",
  sessions: [
    { length: "30 mins", blurb: "A focused chat to work through one question or decision.",
      points: ["Talk through a big decision", "Weigh up your options", "Leave with clear next steps"] },
    { length: "60 mins", blurb: "A fuller look at where you are and where you want to be.",
      points: ["Review your whole picture", "Shape a plan for your goals", "Cover several goals at once"] },
  ],
};

export const COMING_SOON: Record<ComingSoonKey, ComingSoonFeature> = {
  "credit-score": {
    key: "credit-score",
    title: "Credit score",
    headline: { italic: "Understand", rest: "your credit score" },
    lines: ["See where your score sits and what moves it,", "right next to the rest of your money."],
    reassurance: FREE,
    mood: { base: "#2A1306", a: "#C9762B", b: "#8A3E12", c: "#F0B46A" },
    photo: { width: 1600, height: 899, credit: { name: "Lydia Verbeke", url: "https://unsplash.com/photos/aXBewnSyz7c" } },
    preview: { kind: "credit", score: 742, band: "Good", marker: 3, change: "+12 since last month" },
    benefits: [
      { icon: Gauge, title: "Your score in one place", text: "Check where your credit score sits without leaving Maal." },
      { icon: Lightbulb, title: "Know what moves it", text: "Plain-English notes on the habits that lift or lower a score." },
      { icon: ShieldCheck, title: "Your permission first", text: "Nothing is checked unless you ask, and we'll explain how checks work." },
    ],
    faqs: [
      LAUNCH,
      { q: "Will Maal offer loans or credit?", a: "No. Maal doesn't offer credit or loans. This is about understanding your score and looking after it." },
      { q: "Will checking lower my score?", a: "We'll explain exactly how checks work before launch, and nothing will be checked without your permission." },
      COST,
      dataFaq("show your score"),
    ],
  },
  equity: {
    key: "equity",
    title: "Equity",
    headline: { italic: "Understand", rest: "your shares and options" },
    lines: ["Follow your vesting, see what your grants are worth", "and plan around what's still to come."],
    reassurance: FREE,
    mood: { base: "#0C1520", a: "#4E6A86", b: "#22344A", c: "#B9C7D4" },
    photo: { width: 1600, height: 899, credit: { name: "Wilhelm Gunkel", url: "https://unsplash.com/photos/NX08eFxkKJQ" } },
    preview: {
      kind: "equity", company: "Kestrel Robotics", price: "$4.20", valuation: "$3.85",
      grants: [
        { name: "Grant A", type: "Options", total: "20,000 options", vested: "5,000 vested" },
        { name: "Grant B", type: "Rights", total: "8,000 rights", vested: "2,000 vested" },
      ],
    },
    benefits: [
      { icon: CalendarClock, title: "Vesting at a glance", text: "See what has vested, what's next and when it lands." },
      { icon: ChartColumn, title: "What it's worth", text: "Your grants alongside your net worth, only if you choose to count them." },
      { icon: Receipt, title: "The tax side", text: "Learn how employee share schemes are generally taxed in Australia." },
    ],
    faqs: [
      LAUNCH,
      { q: "Which plans will it cover?", a: "We're designing it around the employee share schemes, options and rights common in Australia. We'll confirm details before launch." },
      { q: "Will it count in my net worth?", a: "Only if you want it to. Unvested equity can change a lot, so you'll choose what's included." },
      dataFaq("show your equity"),
      COST,
    ],
  },
  "estate-planning": {
    key: "estate-planning",
    title: "Estate planning",
    headline: { italic: "Plan", rest: "what happens next" },
    lines: ["Get your will and wishes in order,", "so the people you love know what you want."],
    reassurance: FREE,
    mood: { base: "#1E1109", a: "#7A4A2A", b: "#4A2A16", c: "#B98256" },
    photo: { width: 1600, height: 1065, credit: { name: "Joel & Jasmin Førestbird", url: "https://unsplash.com/photos/xzPMUMDDsfk" } },
    preview: {
      kind: "plans",
      plans: [
        { name: "Will", blurb: "The essentials for a simple estate.", points: [
          { label: "Choose who inherits", included: true },
          { label: "Appoint an executor", included: true },
          { label: "Name guardians for children", included: false },
          { label: "Set up a testamentary trust", included: false },
        ] },
        { name: "Will plus", blurb: "For families who want more say.", points: [
          { label: "Choose who inherits", included: true },
          { label: "Appoint an executor", included: true },
          { label: "Name guardians for children", included: true },
          { label: "Set up a testamentary trust", included: false },
        ] },
        { name: "Will and trust", blurb: "For growing or blended families.", points: [
          { label: "Choose who inherits", included: true },
          { label: "Appoint an executor", included: true },
          { label: "Name guardians for children", included: true },
          { label: "Set up a testamentary trust", included: true },
        ] },
      ],
    },
    table: {
      columns: ["Will", "Will plus", "Trust"],
      sections: [
        { label: "Features", rows: [
          { label: "Choose who inherits your assets", cells: [true, true, true] },
          { label: "Appoint an executor to carry out your wishes", cells: [true, true, true] },
          { label: "Leave specific gifts to people or causes", cells: [false, true, true] },
          { label: "Name guardians for children under 18", cells: [false, true, true] },
          { label: "Record funeral and personal wishes", cells: [false, true, true] },
          { label: "Control when and how beneficiaries receive assets", cells: [false, false, true] },
        ] },
        { label: "Legal documents", rows: [
          { label: "Will", cells: [true, true, true] },
          { label: "Enduring power of attorney (financial)", cells: [false, true, true] },
          { label: "Enduring guardianship or medical decision-maker", cells: [false, true, true] },
          { label: "Advance care directive", cells: [false, true, true] },
          { label: "Testamentary trust provisions", cells: [false, false, true] },
        ] },
        { label: "Extra help", rows: [
          { label: "A list of your assets and where they are held", cells: [false, true, true] },
          { label: "Reminder to check your super beneficiary nominations", cells: [true, true, true] },
        ] },
      ],
    },
    benefits: [
      { icon: ScrollText, title: "Made for Australia", text: "Built around how wills and powers of attorney work here, state by state." },
      { icon: Users, title: "Your super, too", text: "A nudge to check your super nominations, which sit outside your will." },
      { icon: FolderLock, title: "Kept in your Vault", text: "Store your documents and instructions where your family can find them." },
    ],
    faqs: [
      LAUNCH,
      { q: "Is this legal advice?", a: "No. Maal isn't a law firm and doesn't give legal advice. Where you need it, we'll point you to a qualified professional." },
      { q: "What's a testamentary trust?", a: "A trust set up by your will that takes effect after you die. It can help control when and how beneficiaries receive assets." },
      { q: "Does my will cover my super?", a: "Not automatically. Super is usually paid under your fund's beneficiary nomination, so it's worth checking that too." },
      COST,
    ],
  },
  "financial-planner": {
    key: "financial-planner",
    title: "Financial planning",
    headline: { italic: "Plan", rest: "the years ahead" },
    lines: ["Book time with a Certified Financial Planner", "to shape a plan around your goals."],
    reassurance: FREE,
    mood: { base: "#0C1A0C", a: "#4F8A2B", b: "#1F4A1A", c: "#B8D85A" },
    photo: { width: 1600, height: 1065, credit: { name: "Josefin", url: "https://unsplash.com/photos/dIEa0BytZ_g" } },
    preview: SESSION_PREVIEW,
    benefits: [
      { icon: Target, title: "Built on your goals", text: "Start from what matters to you, with your Maal numbers ready to share." },
      { icon: MessageCircle, title: "Questions answered", text: "Talk things through with a qualified planner, one-on-one." },
      { icon: ListChecks, title: "Clear next steps", text: "Leave with steps you can track in your Maal action plan." },
    ],
    faqs: [
      LAUNCH,
      { q: "Is Maal giving me advice?", a: "No. Maal does not provide financial advice. Any advice would come from the planner you meet, not from Maal." },
      { q: "Who are the planners?", a: "Certified Financial Planner professionals. We'll share who you can book with before launch." },
      dataFaq("prepare for your session"),
      COST,
    ],
  },
  tax: {
    key: "tax",
    title: "Tax",
    headline: { italic: "Simplify", rest: "tax time" },
    lines: ["Keep your income, deductions and records together", "so you know where you stand before 30 June."],
    reassurance: FREE,
    mood: { base: "#061B1C", a: "#1F8C86", b: "#0D4A4A", c: "#7FD6C8" },
    photo: { width: 1600, height: 1065, credit: { name: "Louis Reed", url: "https://unsplash.com/photos/EWZAHjBzdb8" } },
    preview: {
      kind: "tax", year: "FY ending 30 June",
      rows: [
        { label: "Salary and wages", value: "$84,500" },
        { label: "Work-related deductions", value: "$1,320" },
        { label: "Tax withheld", value: "$17,950" },
        { label: "Estimated refund", value: "$544", strong: true },
      ],
      note: "Lodge with the ATO through myGov or your tax agent.",
    },
    benefits: [
      { icon: FileText, title: "Records together", text: "Keep receipts and statements in one place through the year." },
      { icon: Receipt, title: "A rough estimate", text: "An indicative view of a possible refund or bill, before you lodge." },
      { icon: CalendarCheck, title: "Key dates", text: "Reminders for the dates that matter around 30 June and after." },
    ],
    faqs: [
      LAUNCH,
      { q: "Will Maal lodge my return?", a: "We'll confirm exactly what it covers before launch. For now, keep lodging through myGov or your registered tax agent." },
      { q: "Is the estimate tax advice?", a: "No. Any estimate would be indicative and educational only. Your actual result comes from the ATO." },
      dataFaq("organise your tax"),
      COST,
    ],
  },
  "id-protection": {
    key: "id-protection",
    title: "ID protection",
    headline: { italic: "Protect", rest: "your identity" },
    lines: ["Watch for your details in known data breaches", "and get clear steps on what to do next."],
    reassurance: FREE,
    mood: { base: "#0D0F1E", a: "#4A4F9A", b: "#23264F", c: "#9AA3D6" },
    photo: { width: 1600, height: 1200, credit: { name: "Armand Khoury", url: "https://unsplash.com/photos/BFlD8qNL2UI" } },
    preview: {
      kind: "id",
      rows: [
        { item: "m•••••@email.com", status: "Monitored" },
        { item: "Online store breach", status: "Action needed", alert: true },
        { item: "Mobile number", status: "No new finds" },
      ],
    },
    benefits: [
      { icon: ScanSearch, title: "Breach monitoring", text: "Checks for the details you choose in known data breaches." },
      { icon: BellRing, title: "Alerts that matter", text: "A heads-up when something turns up, not a stream of noise." },
      { icon: KeyRound, title: "Clear next steps", text: "What to change, who to contact and in what order." },
    ],
    faqs: [
      LAUNCH,
      { q: "What will it watch for?", a: "Details you choose, such as your email address or mobile number, checked against known data breaches." },
      { q: "Can it stop a breach?", a: "No service can stop a breach at another company. This is about finding out sooner and knowing what to do." },
      dataFaq("run those checks"),
      COST,
    ],
  },
  "cfp-sessions": {
    key: "cfp-sessions",
    title: "CFP sessions",
    headline: { italic: "Meet", rest: "a financial planner" },
    lines: ["Book a one-on-one session with a Certified Financial Planner,", "with your Maal numbers ready if you choose."],
    reassurance: FREE,
    mood: { base: "#0E1A0B", a: "#5E8F35", b: "#24461C", c: "#C9DE7A" },
    photo: { width: 1600, height: 1065, credit: { name: "Jonathan Dick, OSFS", url: "https://unsplash.com/photos/3Pe084m26hg" } },
    preview: SESSION_PREVIEW,
    benefits: [
      { icon: CalendarCheck, title: "Book a time", text: "Pick a session length and a time that suits you." },
      { icon: UserRound, title: "One-on-one", text: "Your session, with a Certified Financial Planner." },
      { icon: Share2, title: "Share if you want", text: "Bring your Maal numbers along, only with your consent." },
    ],
    faqs: [
      LAUNCH,
      { q: "Who are the planners?", a: "Certified Financial Planner professionals. We'll share who you can book with before launch." },
      { q: "Is Maal giving me advice?", a: "No. Maal does not provide financial advice. Any advice would come from the planner you meet, not from Maal." },
      dataFaq("prepare for your session"),
      COST,
    ],
  },
};
