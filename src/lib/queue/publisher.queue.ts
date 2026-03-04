import { getQStash } from "./connection";

export interface PublishJobData {
  postId: string;
  platform: string;
  userId: string;
  publishId: string; // sns_post_publishes row ID
}

/**
 * Schedule a publish job via QStash.
 * QStash will POST to our webhook endpoint with the job data.
 */
export async function schedulePublishJob(
  data: PublishJobData,
  delaySeconds?: number,
) {
  const qstash = getQStash();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const response = await qstash.publishJSON({
    url: `${appUrl}/api/webhooks/publish`,
    body: data,
    retries: 3,
    ...(delaySeconds ? { delay: `${delaySeconds}s` as `${bigint}s` } : {}),
  });

  return response;
}
