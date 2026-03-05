import { NextRequest, NextResponse } from "next/server";
import { requireOrgScope } from "@/lib/api/org-scope";

function parseRange(range: string | null): number {
  if (range === "90d") return 90;
  if (range === "30d") return 30;
  return 7;
}

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
      post:sns_posts!inner ( id, tags, org_id ),
      analytics:sns_post_analytics ( impressions, likes, comments, shares, saves )
    `,
    )
    .eq("post.org_id", ctx.orgId)
    .eq("status", "published")
    .gte("published_at", since);

  const rows = (data ?? []) as unknown as Array<{
    platform: string;
    published_at: string | null;
    post:
      | { id: string; tags: string[] | null; org_id: string }
      | Array<{ id: string; tags: string[] | null; org_id: string }>;
    analytics: Array<{
      impressions: number | null;
      likes: number | null;
      comments: number | null;
      shares: number | null;
      saves: number | null;
    }> | null;
  }>;

  const tagCounts = new Map<string, number>();
  const platformImpressions = new Map<string, number>();
  const hourCounts = new Map<number, { impressions: number; n: number }>();

  for (const r of rows) {
    const post = Array.isArray(r.post) ? r.post[0] : r.post;
    const a = r.analytics?.[0];
    if (!a) continue;
    const impressions = a.impressions ?? 0;
    platformImpressions.set(
      r.platform,
      (platformImpressions.get(r.platform) ?? 0) + impressions,
    );
    for (const t of post.tags ?? []) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
    if (r.published_at) {
      const h = new Date(r.published_at).getHours();
      const prev = hourCounts.get(h) ?? { impressions: 0, n: 0 };
      hourCounts.set(h, {
        impressions: prev.impressions + impressions,
        n: prev.n + 1,
      });
    }
  }

  const topTag = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  const topPlatform = Array.from(platformImpressions.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0];
  const bestHour = Array.from(hourCounts.entries())
    .map(([h, v]) => ({ h, avg: v.n > 0 ? v.impressions / v.n : 0 }))
    .sort((a, b) => b.avg - a.avg)[0];

  const insights = [
    {
      title: topTag
        ? `Winning tag pattern: “${topTag[0]}”`
        : "Add a consistent tag taxonomy",
      evidence: topTag
        ? `Most frequent tag in the last ${days} days: ${topTag[0]} (${topTag[1]} posts).`
        : "Tags are sparse — consistent topic/format/hook tags unlock better analytics and reuse.",
      next_action: topTag
        ? "Create 2 new drafts reusing this tag + a different hook angle."
        : "Standardize tags: topic / format / hook / CTA. Start with 3 options each.",
      status: "planned" as const,
    },
    {
      title: topPlatform
        ? `Platform focus: ${topPlatform[0]}`
        : "Compare platforms with enough volume",
      evidence: topPlatform
        ? `Highest impressions share in last ${days} days: ${topPlatform[0]} (${topPlatform[1]} impressions).`
        : "Not enough published analytics yet to pick a leading platform.",
      next_action: topPlatform
        ? `Generate 5 variations for ${topPlatform[0]} using AI Studio and push to approval.`
        : "Publish at least 5 posts per platform to stabilize the signal.",
      status: "planned" as const,
    },
    {
      title: bestHour
        ? `Experiment: post time @ ${bestHour.h}:00`
        : "Experiment: post time",
      evidence: bestHour
        ? `Best observed average impressions at ${bestHour.h}:00 (based on published posts in range).`
        : "Time-of-day signal not yet stable. Start a controlled A/B time test.",
      next_action:
        "Run A/B test: same format + different time windows for 7 days.",
      status: "planned" as const,
    },
  ];

  return NextResponse.json({ range_days: days, data: insights });
}
