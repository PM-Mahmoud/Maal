import { createFileRoute } from "@tanstack/react-router";
import { TransactionsPage } from "@/components/maal/spending/transactions/TransactionsPage";

// Transactions list (redesign session 2 "Spending", HEL-91..95): search,
// filters, CSV export, manual add. Row detail is the Transaction detail part.
export const Route = createFileRoute("/_authenticated/app/transactions")({ component: TransactionsPage });
