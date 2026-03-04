import { NextRequest, NextResponse } from "next/server";
import { XProvider } from "@/lib/providers/x.provider";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decrypt } from "@/utils/token-encryption";
import { canPublish, recordPublish } from "@/utils/rate-limiter";
import type { PublishJobData } from "@/lib/queue/publisher.queue";
import type { OAuthToken, PostContent } from "@/types/platform";

export async function POST(request: NextRequest) {
  try {
    const data = (await request.json()) as PublishJobData;
    const { postId, platform, userId, publishId } = data;

    // Check rate limit
    const rateCheck = await canPublish(userId, platform);
    if (!rateCheck.allowed) {
      // Return 429 — QStash will retry
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          code: "RATE_LIMITED",
          retryAfterSeconds: rateCheck.retryAfterSeconds,
        },
        { status: 429 },
      );
    }

    const supabase = await createSupabaseServerClient();

    // Get post content
    const { data: post, error: postError } = await supabase
      .from("sns_posts")
      .select("*")
      .eq("id", postId)
      .single();

    if (postError || !post) {
      return NextResponse.json(
        { error: "Post not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    // Get platform connection (encrypted token)
    const { data: connection, error: connError } = await supabase
      .from("sns_platform_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("platform", platform)
      .eq("status", "active")
      .single();

    if (connError || !connection) {
      await updatePublishStatus(
        supabase,
        publishId,
        "failed",
        "No active platform connection",
      );
      return NextResponse.json(
        { error: "No platform connection", code: "NO_CONNECTION" },
        { status: 400 },
      );
    }

    // Decrypt token
    const token: OAuthToken = {
      accessToken: decrypt(connection.encrypted_token),
      accessSecret: connection.encrypted_refresh_token
        ? decrypt(connection.encrypted_refresh_token)
        : undefined,
    };

    // Get adapted content or use original
    const { data: adaptation } = await supabase
      .from("sns_post_adaptations")
      .select("content_adapted")
      .eq("post_id", postId)
      .eq("platform", platform)
      .single();

    const content: PostContent = {
      text: adaptation?.content_adapted || post.content_original,
      mediaUrls: post.media_urls || undefined,
    };

    // Publish based on platform
    let result;
    if (platform === "x") {
      const provider = new XProvider();
      result = await provider.publishPost(token, content);
    } else {
      await updatePublishStatus(
        supabase,
        publishId,
        "failed",
        `Platform ${platform} not yet supported`,
      );
      return NextResponse.json(
        { error: `Platform ${platform} not supported`, code: "UNSUPPORTED" },
        { status: 400 },
      );
    }

    if (result.success) {
      await updatePublishStatus(
        supabase,
        publishId,
        "published",
        null,
        result.platformPostId,
        result.platformUrl,
      );
      await supabase
        .from("sns_posts")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", postId);
      await recordPublish(userId, platform);
      return NextResponse.json({ success: true, result });
    } else {
      // Increment retry count
      await supabase
        .from("sns_post_publishes")
        .update({ retry_count: (post.retry_count || 0) + 1 })
        .eq("id", publishId);
      await updatePublishStatus(
        supabase,
        publishId,
        "failed",
        result.error || "Unknown error",
      );
      return NextResponse.json(
        { error: result.error, code: "PUBLISH_FAILED" },
        { status: 500 },
      );
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Internal error",
        code: "INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase client type depends on generated DB types
async function updatePublishStatus(
  supabase: any,
  publishId: string,
  status: string,
  errorMessage: string | null,
  platformPostId?: string,
  platformUrl?: string,
) {
  const update: Record<string, unknown> = {
    status,
    error_message: errorMessage,
  };
  if (status === "published") {
    update.published_at = new Date().toISOString();
    if (platformPostId) update.platform_post_id = platformPostId;
    if (platformUrl) update.platform_url = platformUrl;
  }
  await supabase.from("sns_post_publishes").update(update).eq("id", publishId);
}
