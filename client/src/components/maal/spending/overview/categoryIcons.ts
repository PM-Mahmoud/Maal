import {
  ArrowLeftRight, Baby, Briefcase, Car, CircleDollarSign, CreditCard, Gift, GraduationCap, HeartPulse, Home,
  Landmark, MoreHorizontal, Plane, Repeat, ShoppingBag, PiggyBank, UtensilsCrossed, Zap, type LucideIcon,
} from "lucide-react";

// One icon per group of the 18-group AU taxonomy (lib/transaction-categories.js).
const ICONS: Record<string, LucideIcon> = {
  "Income": CircleDollarSign,
  "Credit Card Payments": CreditCard,
  "Transfers": ArrowLeftRight,
  "Financial": Landmark,
  "Savings & Investments": PiggyBank,
  "Housing": Home,
  "Bills & Utilities": Zap,
  "Food & Dining": UtensilsCrossed,
  "Health & Wellness": HeartPulse,
  "Auto & Transport": Car,
  "Shopping": ShoppingBag,
  "Travel & Lifestyle": Plane,
  "Education": GraduationCap,
  "Children": Baby,
  "Recurring & Subscriptions": Repeat,
  "Business": Briefcase,
  "Gifts & Donations": Gift,
  "Other": MoreHorizontal,
};

export function iconForGroup(group: string | undefined | null): LucideIcon {
  return (group && ICONS[group]) || MoreHorizontal;
}
