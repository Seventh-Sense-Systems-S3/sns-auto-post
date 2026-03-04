import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { updateEngagementScores } from "@/lib/ai/embedding-pipeline";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: Request) {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const supabase = getServiceClient();

  try {
    // Get published posts from last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: publishes } = await supabase
      .from("sns_post_publishes")
      .select("id, post_id, platform, platform_post_id, published_at")
      .gte("published_at", since)
      .eq("status", "published");

    if (!publishes || publishes.length === 0) {
      return NextResponse.json({
        message: "No recent publishes to analyze",
        analyzed: 0,
      });
    }

    let analyzed = 0;

    // TODO: Implement platform-specific analytics fetching
    // For now, create placeholder analytics records
    for (const publish of publishes) {
      const { error } = await supabase.from("sns_post_analytics").upsert(
        {
          publish_id: publish.id,
          post_id: publish.post_id,
          platform: publish.platform,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "publish_id" },
      );

      if (!error) analyzed++;
    }

    // Update engagement scores for all orgs with recent posts
    const { data: posts } = await supabase
      .from("sns_posts")
      .select("org_id")
      .in(
        "id",
        publishes.map((p: { post_id: string }) => p.post_id),
      );

    const orgIds = [
      ...new Set((posts || []).map((p: { org_id: string }) => p.org_id)),
    ];
    for (const orgId of orgIds) {
      if (orgId) {
        await updateEngagementScores(orgId);
      }
    }

    return NextResponse.json({
      message: "Analytics collection complete",
      analyzed,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Analytics collection failed";
    return NextResponse.json(
      { error: message, code: "ANALYTICS_ERROR" },
      { status: 500 },
    );
  }
}
