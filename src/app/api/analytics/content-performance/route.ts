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
      post:sns_posts!inner (
        id,
        title,
        content_original,
        tags,
        org_id
      ),
      analytics:sns_post_analytics (
        impressions,
        clicks,
        likes,
        comments,
        shares,
        saves
      )
    `,
    )
    .eq("post.org_id", ctx.orgId)
    .eq("status", "published")
    .gte("published_at", since);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    platform: string;
    published_at: string | null;
    post:
      | {
          id: string;
          title: string | null;
          content_original: string;
          tags: string[] | null;
          org_id: string;
        }
      | Array<{
          id: string;
          title: string | null;
          content_original: string;
          tags: string[] | null;
          org_id: string;
        }>;
    analytics: Array<{
      impressions: number | null;
      clicks: number | null;
      likes: number | null;
      comments: number | null;
      shares: number | null;
      saves: number | null;
    }> | null;
  }>;

  const enriched = rows
    .map((r) => {
      const post = Array.isArray(r.post) ? r.post[0] : r.post;
      const a = r.analytics?.[0];
      const impressions = a?.impressions ?? 0;
      const clicks = a?.clicks ?? 0;
      const engagement =
        (a?.likes ?? 0) +
        (a?.comments ?? 0) +
        (a?.shares ?? 0) +
        (a?.saves ?? 0);
      return {
        publish_id: r.id,
        post_id: post.id,
        platform: r.platform,
        published_at: r.published_at,
        title: post.title,
        content_preview: post.content_original.slice(0, 140),
        tags: post.tags ?? [],
        impressions,
        engagement,
        ctr: impressions > 0 ? clicks / impressions : 0,
      };
    })
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10);

  return NextResponse.json({ range_days: days, data: enriched });
}
