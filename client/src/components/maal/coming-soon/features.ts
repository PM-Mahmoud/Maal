// Per-feature config for the shared ComingSoonPage (2026-11-23).
// Copy rules: Maal's own words, Australian English, no dates, never claim the
// feature exists yet. Credit score copy must not suggest Maal offers credit or
// loans. The `key` is what POST /feedback records as `[service-interest] <key>`.

import {
  Gauge, Lightbulb, BellRing, ChartColumn, CalendarClock, Receipt, ScrollText, Users, FolderLock,
  NotebookPen, Target, Route, RefreshCw, Calculator, CalendarCheck, ShieldCheck, ScanSearch,
  Contact, UserRound, Share2, type LucideIcon,
} from "lucide-react";

export type ComingSoonKey =
  | "credit-score" | "equity" | "estate-planning" | "financial-planner" | "tax" | "id-protection" | "cfp-sessions";

export type ComingSoonFeature = {
  key: ComingSoonKey;
  /** Page title shown in the header bar (matches the nav label's meaning). */
  title: string;
  /** Lora headline. */
  headline: string;
  /** One supporting line. */
  promise: string;
  /** The feature's own icon, drawn in the middle of the illustration. */
  icon: LucideIcon;
  /** Two accent hues for the illustration (readable on light and dark). */
  colours: [string, string];
  benefits: [Benefit, Benefit, Benefit];
};
type Benefit = { icon: LucideIcon; label: string };

export const COMING_SOON: Record<ComingSoonKey, ComingSoonFeature> = {
  "credit-score": {
    key: "credit-score",
    title: "Credit score",
    headline: "Your credit score, explained",
    promise: "See where your credit score sits, what moves it and how to look after it, next to the rest of your money.",
    icon: Gauge,
    colours: ["#12B5A6", "#F2A93B"],
    benefits: [
      { icon: Gauge, label: "Check your score in one place" },
      { icon: Lightbulb, label: "Understand what affects it" },
      { icon: BellRing, label: "Hear about changes as they happen" },
    ],
  },
  equity: {
    key: "equity",
    title: "Equity",
    headline: "Your shares and options, in one view",
    promise: "Keep track of employee shares and options, see what has vested and plan around what is still to come.",
    icon: ChartColumn,
    colours: ["#5B7CFA", "#A77BF3"],
    benefits: [
      { icon: CalendarClock, label: "Follow your vesting schedule" },
      { icon: ChartColumn, label: "See what your equity is worth" },
      { icon: Receipt, label: "Learn how it is taxed" },
    ],
  },
  "estate-planning": {
    key: "estate-planning",
    title: "Estate planning",
    headline: "Look after the people who matter",
    promise: "Get your will, super nominations and wishes in order, so your family knows what you want.",
    icon: ScrollText,
    colours: ["#E07A5F", "#F2A93B"],
    benefits: [
      { icon: ScrollText, label: "Prepare your will" },
      { icon: Users, label: "Check your super beneficiaries" },
      { icon: FolderLock, label: "Keep key documents together" },
    ],
  },
  "financial-planner": {
    key: "financial-planner",
    title: "Financial planning",
    headline: "A long-term plan built around your life",
    promise: "Turn your goals, income and commitments into a clear plan you can keep up to date as things change.",
    icon: NotebookPen,
    colours: ["#7C5CFF", "#4DB0F0"],
    benefits: [
      { icon: Target, label: "Start from your goals" },
      { icon: Route, label: "Map out the steps" },
      { icon: RefreshCw, label: "Review it as life changes" },
    ],
  },
  tax: {
    key: "tax",
    title: "Tax",
    headline: "Tax time, with less guesswork",
    promise: "Bring your income, deductions and records together so you know where you stand before tax time.",
    icon: Receipt,
    colours: ["#2FA36B", "#12B5A6"],
    benefits: [
      { icon: Receipt, label: "Keep records and receipts together" },
      { icon: Calculator, label: "Estimate your refund or bill" },
      { icon: CalendarCheck, label: "Stay on top of key dates" },
    ],
  },
  "id-protection": {
    key: "id-protection",
    title: "ID protection",
    headline: "Know if your details turn up where they shouldn't",
    promise: "Watch for your personal details in known data breaches and get clear steps on what to do next.",
    icon: ShieldCheck,
    colours: ["#2196E0", "#12B5A6"],
    benefits: [
      { icon: ScanSearch, label: "Watch for your details in breaches" },
      { icon: BellRing, label: "Get alerted if something turns up" },
      { icon: ShieldCheck, label: "Follow clear steps to stay safe" },
    ],
  },
  "cfp-sessions": {
    key: "cfp-sessions",
    title: "CFP sessions",
    headline: "Time with a Certified Financial Planner",
    promise: "Book a one-on-one session with a Certified Financial Planner, with your Maal numbers ready to share if you choose.",
    icon: Contact,
    colours: ["#D9577A", "#F2A93B"],
    benefits: [
      { icon: CalendarCheck, label: "Book a time that suits you" },
      { icon: UserRound, label: "Talk one-on-one with a planner" },
      { icon: Share2, label: "Share your numbers, only if you want" },
    ],
  },
};
