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

  const [postsRes, publishesRes] = await Promise.all([
    ctx.supabase
      .from("sns_posts")
      .select("id, status, created_at", { count: "exact" })
      .eq("org_id", ctx.orgId)
      .gte("created_at", since),
    ctx.supabase
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
      .gte("published_at", since),
  ]);

  const posts = postsRes.data ?? [];
  const statusCounts = posts.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});

  const rows = (publishesRes.data ?? []) as Array<{
    analytics: Array<{
      impressions: number | null;
      clicks: number | null;
      likes: number | null;
      comments: number | null;
      shares: number | null;
      saves: number | null;
    }> | null;
  }>;
  let impressions = 0;
  let clicks = 0;
  let engagement = 0;

  for (const row of rows) {
    const a = row.analytics?.[0];
    if (!a) continue;
    impressions += a.impressions ?? 0;
    clicks += a.clicks ?? 0;
    engagement +=
      (a.likes ?? 0) + (a.comments ?? 0) + (a.shares ?? 0) + (a.saves ?? 0);
  }

  const er = impressions > 0 ? engagement / impressions : 0;
  const ctr = impressions > 0 ? clicks / impressions : 0;

  return NextResponse.json({
    range_days: days,
    kpis: {
      reach: impressions,
      engagement,
      engagement_rate: er,
      ctr,
      followers_delta: null,
    },
    posts: {
      total: posts.length,
      by_status: statusCounts,
    },
  });
}
