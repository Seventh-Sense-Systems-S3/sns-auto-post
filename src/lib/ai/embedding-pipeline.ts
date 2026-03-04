import { createClient } from "@supabase/supabase-js";
import { generateEmbedding } from "./litellm-client";

// Use service role for server-side operations (bypasses RLS)
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Embed a post's content and store the vector in sns_post_embeddings.
 * Uses upsert so re-embedding the same post overwrites the previous vector.
 */
export async function embedPost(
  postId: string,
  content: string,
  orgId: string,
  platform: string,
) {
  const embedding = await generateEmbedding(content);
  const supabase = getServiceClient();

  const { error } = await supabase.from("sns_post_embeddings").upsert(
    {
      post_id: postId,
      org_id: orgId,
      platform,
      embedding: JSON.stringify(embedding),
    },
    { onConflict: "post_id" },
  );

  if (error) throw new Error(`Failed to embed post: ${error.message}`);
}

/**
 * Find high-engagement ("winning") posts similar to a given topic.
 * Returns post IDs, similarity scores, and the actual content.
 */
export async function findWinningExamples(
  topic: string,
  orgId: string,
  platform: string,
  count: number = 3,
): Promise<{ post_id: string; similarity: number; content: string }[]> {
  const embedding = await generateEmbedding(topic);
  const supabase = getServiceClient();

  const { data, error } = await supabase.rpc("match_winning_posts", {
    query_embedding: JSON.stringify(embedding),
    match_org_id: orgId,
    match_platform: platform,
    match_count: count,
  });

  if (error)
    throw new Error(`Failed to find winning examples: ${error.message}`);
  if (!data || data.length === 0) return [];

  // Fetch actual post content for the matched posts
  const postIds = data.map((d: { post_id: string }) => d.post_id);
  const { data: posts } = await supabase
    .from("sns_posts")
    .select("id, content_original")
    .in("id", postIds);

  const postMap = new Map(
    (posts || []).map((p: { id: string; content_original: string }) => [
      p.id,
      p.content_original,
    ]),
  );

  return data.map((d: { post_id: string; similarity: number }) => ({
    post_id: d.post_id,
    similarity: d.similarity,
    content: postMap.get(d.post_id) || "",
  }));
}

/**
 * Recalculate engagement scores for all embedded posts in an org.
 * Posts in the top percentile (default: top 20%) are marked as "winning".
 */
export async function updateEngagementScores(
  orgId: string,
  threshold: number = 0.8,
) {
  const supabase = getServiceClient();

  // Get all posts with analytics for this org
  const { data: analytics } = await supabase
    .from("sns_post_analytics")
    .select("post_id, likes, retweets, replies, impressions")
    .gt("impressions", 0);

  if (!analytics || analytics.length === 0) return;

  // Calculate engagement rates
  const rates = analytics.map(
    (a: {
      post_id: string;
      likes: number;
      retweets: number;
      replies: number;
      impressions: number;
    }) => ({
      post_id: a.post_id,
      engagement_rate: (a.likes + a.retweets + a.replies) / a.impressions,
    }),
  );

  // Find threshold for top percentile
  const sorted = rates.sort(
    (a: { engagement_rate: number }, b: { engagement_rate: number }) =>
      b.engagement_rate - a.engagement_rate,
  );
  const topIndex = Math.max(1, Math.floor(sorted.length * (1 - threshold)));
  const winningThreshold = sorted[topIndex - 1]?.engagement_rate || 0;

  // Update embeddings with scores
  for (const rate of rates) {
    await supabase
      .from("sns_post_embeddings")
      .update({
        engagement_score: rate.engagement_rate,
        is_winning: rate.engagement_rate >= winningThreshold,
        updated_at: new Date().toISOString(),
      })
      .eq("post_id", rate.post_id);
  }
}
