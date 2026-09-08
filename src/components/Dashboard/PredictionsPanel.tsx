import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Info } from "lucide-react";
import type { DashboardOverview } from "@/hooks/useDashboardOverview";
import { forecast, completedPeriods } from "@/utils/forecast";
import { formatCompactINR } from "@/utils/currency";
import { StatTile } from "@/components/Dashboard/StatTile";

/**
 * Next month, projected from what actually happened.
 *
 * Each figure says what it is based on, because a number with no stated basis
 * invites more trust than a 12-point history deserves. Where there isn't
 * enough history the tile says so rather than showing a confident guess.
 */
interface Props {
  data?: DashboardOverview;
  isLoading?: boolean;
}

function Tile({
  label, value, sub, direction,
}: {
  label: string;
  value: string;
  sub: string;
  direction?: "up" | "down" | "flat";
}) {
  const tone = direction === "up" ? "good" : direction === "down" ? "critical" : "default";
  return <StatTile label={label} value={value} hint={sub} tone={tone} />;
}

function dir(next: number, last: number): "up" | "down" | "flat" {
  if (last === 0) return next > 0 ? "up" : "flat";
  const change = (next - last) / Math.abs(last);
  return change > 0.05 ? "up" : change < -0.05 ? "down" : "flat";
}

export const PredictionsPanel = memo(function PredictionsPanel({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <Card className="p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-[110px] w-full mt-3" />
      </Card>
    );
  }

  const months = data.revenue_months || [];
  const invoiced = months.map((m) => m.invoiced);
  const spend = months.map((m) => m.google_spend);

  // Fit completed months only — the current month is part-way through, and
  // including it makes every trend look like a collapse.
  const spendF = forecast(completedPeriods(spend), 1);

  // Followers project from the last 30 days' movement, not a fitted series —
  // there is only one snapshot cadence and a month of it.
  const linkedin = (data.organic || []).find((c) => c.channel === "linkedin");

  const lastComplete = <T,>(a: T[]) => a[a.length - 2] ?? a[a.length - 1];
  const lastSpend = lastComplete(spend) ?? 0;

  // Revenue is this month's real invoiced total (Proforma + Tax Invoices), not
  // a forecast — the current month is the last, part-way-through entry.
  const thisMonthInvoiced = invoiced[invoiced.length - 1] ?? 0;
  const lastMonthInvoiced = invoiced[invoiced.length - 2] ?? 0;

  const bd = data.bd || {} as DashboardOverview["bd"];
  const jobApplications = data.job_applications || { applied: 0, evaluated: 0 };

  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">Next month, projected</h3>
        <p className="text-[11px] text-muted-foreground">
          Revenue is this month's actual total; the rest is projected from the last 6 completed months, damped so one unusual month can't run away with it
        </p>
      </div>

      <div className="grid gap-2 grid-cols-2 lg:grid-cols-5">
        <Tile
          label="Revenue"
          value={formatCompactINR(thisMonthInvoiced)}
          sub="so far this month, PI + Invoices"
          direction={dir(thisMonthInvoiced, lastMonthInvoiced)}
        />
        <Tile
          label="Ad spend"
          value={spendF ? formatCompactINR(spendF.points[0]) : "—"}
          sub={spendF ? "at the current run rate" : "not enough history"}
          direction={spendF ? dir(spendF.points[0], lastSpend) : undefined}
        />
        <Tile
          label="BD sent"
          value={String(bd.sent_unique_companies ?? 0)}
          sub="unique companies contacted"
        />
        <Tile
          label="Job applications"
          value={String(jobApplications.applied ?? 0)}
          sub="applications sent"
        />
        <Tile
          label="LinkedIn followers"
          value={linkedin ? (linkedin.followers + linkedin.follower_change).toLocaleString("en-IN") : "—"}
          sub={linkedin
            ? `${linkedin.follower_change >= 0 ? "+" : ""}${linkedin.follower_change} in the last 30 days`
            : "no snapshots yet"}
          direction={linkedin ? (linkedin.follower_change > 0 ? "up" : linkedin.follower_change < 0 ? "down" : "flat") : undefined}
        />
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground flex items-start gap-1">
        <Info className="h-3 w-3 mt-px shrink-0" />
        Projections, not commitments. Leads are left out on purpose — 5 enquiries in
        12 months is too little to forecast from, and a number there would be invented.
      </p>
    </Card>
  );
});
