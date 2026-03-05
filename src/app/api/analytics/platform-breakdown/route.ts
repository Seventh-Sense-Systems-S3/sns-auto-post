import { NextRequest, NextResponse } from "next/server";
import { requireOrgScope } from "@/lib/api/org-scope";

function parseRange(range: string | null): number {
  if (range === "90d") return 90;
  if (range === "30d") return 30;
  return 7;
}

type AnalyticsRow = {
  impressions: number | null;
  clicks: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  video_views: number | null;
};

export async function GET(request: NextRequest) {
  const ctx = await requireOrgScope(request);
  if (ctx instanceof NextResponse) return ctx;

  const days = parseRange(request.nextUrl.searchParams.get("range"));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await ctx.supabase
    .from("sns_post_publishes")
    .select(
      `
      id,
      platform,
      published_at,
      post:sns_posts!inner ( org_id ),
      analytics:sns_post_analytics (
        impressions,
        clicks,
        likes,
        comments,
        shares,
        saves,
        video_views
      )
    `,
    )
    .eq("post.org_id", ctx.orgId)
    .eq("status", "published")
    .gte("published_at", since);

  const rows = (data ?? []) as Array<{
    platform: string;
    published_at: string | null;
    analytics: AnalyticsRow[] | null;
  }>;

  const byPlatform = new Map<
    string,
    {
      impressions: number;
      clicks: number;
      engagement: number;
      byDay: Map<string, number>;
    }
  >();

  for (const row of rows) {
    const platform = row.platform;
    const a = row.analytics?.[0];
    if (!a) continue;

    const impressions = a.impressions ?? 0;
    const clicks = a.clicks ?? 0;
    const engagement =
      (a.likes ?? 0) + (a.comments ?? 0) + (a.shares ?? 0) + (a.saves ?? 0);

    const dayKey = row.published_at
      ? new Date(row.published_at).toISOString().slice(0, 10)
      : "unknown";

    const bucket = byPlatform.get(platform) ?? {
      impressions: 0,
      clicks: 0,
      engagement: 0,
      byDay: new Map<string, number>(),
    };

    bucket.impressions += impressions;
    bucket.clicks += clicks;
    bucket.engagement += engagement;
    if (dayKey !== "unknown") {
      bucket.byDay.set(dayKey, (bucket.byDay.get(dayKey) ?? 0) + impressions);
    }

    byPlatform.set(platform, bucket);
  }

  const breakdown = Array.from(byPlatform.entries())
    .map(([platform, b]) => ({
      platform,
      impressions: b.impressions,
      engagement: b.engagement,
      ctr: b.impressions > 0 ? b.clicks / b.impressions : 0,
      sparkline: Array.from(b.byDay.entries())
        .sort(([a], [b2]) => a.localeCompare(b2))
        .map(([date, impressions]) => ({ date, impressions })),
    }))
    .sort((a, b) => b.impressions - a.impressions);

  return NextResponse.json({ range_days: days, data: breakdown });
}
