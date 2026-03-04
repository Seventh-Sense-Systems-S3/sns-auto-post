import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canPublish } from "@/utils/rate-limiter";
import { schedulePublishJob } from "@/lib/queue/publisher.queue";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  // Get post
  const { data: post, error: postError } = await supabase
    .from("sns_posts")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (postError || !post) {
    return NextResponse.json(
      { error: "Post not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  if (!["approved", "scheduled"].includes(post.status)) {
    return NextResponse.json(
      {
        error: "Post must be approved before publishing",
        code: "INVALID_STATUS",
      },
      { status: 409 },
    );
  }

  // Parse body for target platforms
  const body = await request.json().catch(() => ({}));
  const platforms: string[] = body.platforms || ["x"]; // default to X

  // Check rate limits for all platforms
  for (const platform of platforms) {
    const rateCheck = await canPublish(user.id, platform);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit exceeded for ${platform}`,
          code: "RATE_LIMITED",
          retryAfterSeconds: rateCheck.retryAfterSeconds,
        },
        { status: 429 },
      );
    }
  }

  // Create publish records and schedule jobs
  const results = [];
  for (const platform of platforms) {
    // Upsert publish record
    const { data: publish, error: publishError } = await supabase
      .from("sns_post_publishes")
      .upsert(
        { post_id: id, platform, status: "pending" },
        { onConflict: "post_id,platform" },
      )
      .select()
      .single();

    if (publishError || !publish) {
      results.push({ platform, error: "Failed to create publish record" });
      continue;
    }

    // Schedule via QStash
    try {
      await schedulePublishJob({
        postId: id,
        platform,
        userId: user.id,
        publishId: publish.id,
      });
      results.push({ platform, status: "queued", publishId: publish.id });
    } catch (err) {
      results.push({
        platform,
        error: err instanceof Error ? err.message : "Queue error",
      });
    }
  }

  // Update post status
  await supabase
    .from("sns_posts")
    .update({ status: "publishing" })
    .eq("id", id);

  return NextResponse.json(
    { message: "Publishing queued", results },
    { status: 202 },
  );
}
