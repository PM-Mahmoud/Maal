// Types for shared/report-url.mjs (Reports settings <-> URL search params).
declare module "*report-url.mjs" {
  import type { Interval, RangeConfig, RangePreset, ReportTab, ViewBy } from "*spending-reports.mjs";
  export type ReportChart = "net" | "split" | "flow" | "bars" | "donut";
  export type ReportSearch = {
    tab?: ReportTab; preset?: RangePreset; from?: string; to?: string; interval?: Interval;
    chart?: ReportChart; viewBy?: ViewBy; groups?: string[]; view?: string;
  };
  export type UrlConfig = { tab: ReportTab; chart: ReportChart; interval: Interval; viewBy: ViewBy; range: RangeConfig; groups: string[] };
  export const URL_GROUPS: readonly string[];
  export const DEFAULT_REPORT: Readonly<{ tab: ReportTab; chart: ReportChart; interval: Interval; viewBy: ViewBy; range: RangeConfig }>;
  export function parseReportSearch(raw: unknown): ReportSearch;
  export function configFromSearch(search: ReportSearch | Record<string, unknown> | null | undefined): UrlConfig;
  export function searchFromConfig(
    config: { tab?: string; chart?: string; interval?: string; viewBy?: string; range?: { preset?: string; from?: string; to?: string }; filters?: { groups?: string[] }; groups?: string[] } | null | undefined,
    view?: string | null,
  ): ReportSearch;
}
