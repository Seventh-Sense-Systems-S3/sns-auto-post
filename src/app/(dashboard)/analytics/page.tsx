"use client";

import * as React from "react";
import useSWR from "swr";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useOrg } from "@/components/tenant/org-context";
import { apiFetch } from "@/lib/api/fetcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Range = "7d" | "30d" | "90d";

type OverviewResponse = {
  range_days: number;
  kpis: {
    reach: number;
    engagement: number;
    engagement_rate: number;
    ctr: number;
    followers_delta: number | null;
  };
  posts: { total: number; by_status: Record<string, number> };
};

type PlatformBreakdownResponse = {
  data: Array<{
    platform: string;
    impressions: number;
    engagement: number;
    ctr: number;
    sparkline: Array<{ date: string; impressions: number }>;
  }>;
};

type ContentPerformanceResponse = {
  data: Array<{
    publish_id: string;
    post_id: string;
    platform: string;
    published_at: string | null;
    title: string | null;
    content_preview: string;
    tags: string[];
    impressions: number;
    engagement: number;
    ctr: number;
  }>;
};

type InsightsResponse = {
  data: Array<{
    title: string;
    evidence: string;
    next_action: string;
    status: "planned" | "running" | "concluded";
  }>;
};

export default function AnalyticsPage() {
  const { activeOrg } = useOrg();
  const orgId = activeOrg?.id;
  const [range, setRange] = React.useState<Range>("7d");

  const { data: overview, error: overviewError } = useSWR<OverviewResponse>(
    orgId ? `/api/analytics/overview?range=${range}` : null,
    (url: string) => apiFetch<OverviewResponse>(url, { orgId }),
  );

  const { data: platform } = useSWR<PlatformBreakdownResponse>(
    orgId ? `/api/analytics/platform-breakdown?range=${range}` : null,
    (url: string) => apiFetch<PlatformBreakdownResponse>(url, { orgId }),
  );

  const { data: performance } = useSWR<ContentPerformanceResponse>(
    orgId ? `/api/analytics/content-performance?range=${range}` : null,
    (url: string) => apiFetch<ContentPerformanceResponse>(url, { orgId }),
  );

  const { data: insights } = useSWR<InsightsResponse>(
    orgId ? `/api/analytics/learning-insights?range=${range}` : null,
    (url: string) => apiFetch<InsightsResponse>(url, { orgId }),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Engagement overview, platform breakdown, and learnings for the
            active workspace.
          </p>
        </div>
        <div className="flex gap-2">
          <RangeButton value="7d" current={range} onClick={setRange} />
          <RangeButton value="30d" current={range} onClick={setRange} />
          <RangeButton value="90d" current={range} onClick={setRange} />
        </div>
      </div>

      {overviewError ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {overviewError.message}
        </div>
      ) : null}

      <EngagementOverview overview={overview ?? null} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PlatformBreakdown breakdown={platform?.data ?? []} />
        <LearningInsights insights={insights?.data ?? []} />
      </div>

      <ContentPerformance rows={performance?.data ?? []} />
    </div>
  );
}

function RangeButton({
  value,
  current,
  onClick,
}: {
  value: Range;
  current: Range;
  onClick: (v: Range) => void;
}) {
  const active = value === current;
  return (
    <Button
      variant={active ? "default" : "outline"}
      onClick={() => onClick(value)}
      className="h-9"
    >
      {value}
    </Button>
  );
}

function EngagementOverview({
  overview,
}: {
  overview: OverviewResponse | null;
}) {
  const k = overview?.kpis;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <KpiCard
        label="Reach"
        value={k ? formatInt(k.reach) : "—"}
        hint="Impressions"
      />
      <KpiCard
        label="Engagement"
        value={k ? formatInt(k.engagement) : "—"}
        hint="Likes+comments+shares+saves"
      />
      <KpiCard
        label="Engagement rate"
        value={k ? formatPct(k.engagement_rate) : "—"}
        hint="Engagement / impressions"
      />
      <KpiCard
        label="CTR"
        value={k ? formatPct(k.ctr) : "—"}
        hint="Clicks / impressions"
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="mt-1 text-xs text-zinc-500">{hint}</div>
      </CardContent>
    </Card>
  );
}

function PlatformBreakdown({
  breakdown,
}: {
  breakdown: PlatformBreakdownResponse["data"];
}) {
  const chartData = breakdown.map((b) => ({
    platform: b.platform,
    impressions: b.impressions,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="platform" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="impressions" fill="#18181b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Platform</TableHead>
              <TableHead className="text-right">Impressions</TableHead>
              <TableHead className="text-right">Engagement</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">Trend</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {breakdown.map((b) => (
              <TableRow key={b.platform}>
                <TableCell className="font-medium">{b.platform}</TableCell>
                <TableCell className="text-right">
                  {formatInt(b.impressions)}
                </TableCell>
                <TableCell className="text-right">
                  {formatInt(b.engagement)}
                </TableCell>
                <TableCell className="text-right">{formatPct(b.ctr)}</TableCell>
                <TableCell className="text-right">
                  <div className="ml-auto h-10 w-28">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={b.sparkline}>
                        <Line
                          type="monotone"
                          dataKey="impressions"
                          stroke="#18181b"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {breakdown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-zinc-500">
                  No analytics yet. Publish some posts to populate metrics.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ContentPerformance({
  rows,
}: {
  rows: ContentPerformanceResponse["data"];
}) {
  const [sortKey, setSortKey] = React.useState<
    "impressions" | "engagement" | "ctr"
  >("impressions");

  const sorted = React.useMemo(() => {
    return [...rows].sort((a, b) => b[sortKey] - a[sortKey]);
  }, [rows, sortKey]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Top posts</CardTitle>
        <select
          className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
        >
          <option value="impressions">Impressions</option>
          <option value="engagement">Engagement</option>
          <option value="ctr">CTR</option>
        </select>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Platform</TableHead>
              <TableHead>Preview</TableHead>
              <TableHead className="text-right">Impressions</TableHead>
              <TableHead className="text-right">Engagement</TableHead>
              <TableHead className="text-right">CTR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.publish_id}>
                <TableCell className="font-medium">{r.platform}</TableCell>
                <TableCell className="max-w-[640px]">
                  <div className="truncate text-sm">
                    {r.title ? (
                      <span className="font-medium">{r.title} — </span>
                    ) : null}
                    {r.content_preview}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.tags.slice(0, 4).map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {formatInt(r.impressions)}
                </TableCell>
                <TableCell className="text-right">
                  {formatInt(r.engagement)}
                </TableCell>
                <TableCell className="text-right">{formatPct(r.ctr)}</TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-zinc-500">
                  No published posts in this range.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function LearningInsights({
  insights,
}: {
  insights: InsightsResponse["data"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Learning insights</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.map((i) => (
          <div key={i.title} className="rounded-md border border-zinc-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-medium">{i.title}</div>
              <Badge variant="default" className="capitalize">
                {i.status}
              </Badge>
            </div>
            <div className="mt-1 text-sm text-zinc-600">{i.evidence}</div>
            <div className="mt-2 text-sm">
              <span className="font-medium">Next:</span> {i.next_action}
            </div>
          </div>
        ))}
        {insights.length === 0 ? (
          <div className="text-sm text-zinc-500">
            No insights yet. Once analytics data accumulates, suggestions appear
            here.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatInt(n: number) {
  return new Intl.NumberFormat().format(n);
}

function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
