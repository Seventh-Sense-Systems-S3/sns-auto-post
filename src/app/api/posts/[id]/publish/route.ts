import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    // Check post exists and belongs to user
    const { data: post, error: fetchError } = await supabase
      .from("sns_posts")
      .select("status, scheduled_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !post) {
      return NextResponse.json(
        { error: "Post not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (post.status !== "approved" && post.status !== "scheduled") {
      return NextResponse.json(
        {
          error: "Can only publish posts with approved or scheduled status",
          code: "INVALID_STATUS",
        },
        { status: 409 },
      );
    }

    // Determine target status based on scheduled_at
    const isScheduled =
      post.scheduled_at && new Date(post.scheduled_at) > new Date();
    const newStatus = isScheduled ? "scheduled" : "publishing";

    // Update post status
    const { error: updateError } = await supabase
      .from("sns_posts")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message, code: "DB_ERROR" },
        { status: 500 },
      );
    }

    // Get target platforms from adaptations
    const { data: adaptations } = await supabase
      .from("sns_post_adaptations")
      .select("platform")
      .eq("post_id", id);

    if (!adaptations || adaptations.length === 0) {
      return NextResponse.json(
        {
          error: "No platform adaptations found for this post",
          code: "VALIDATION_ERROR",
        },
        { status: 400 },
      );
    }

    // Create publish records for each target platform
    const publishRecords = adaptations.map((a) => ({
      post_id: id,
      platform: a.platform,
      status: "pending" as const,
      retry_count: 0,
    }));

    const { data: publishes, error: publishError } = await supabase
      .from("sns_post_publishes")
      .insert(publishRecords)
      .select();

    if (publishError) {
      return NextResponse.json(
        { error: publishError.message, code: "DB_ERROR" },
        { status: 500 },
      );
    }

    // NOTE: Actual queue integration (QStash) will be handled by x-publish teammate
    return NextResponse.json(
      { post_id: id, status: newStatus, publishes },
      { status: 202 },
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
