import { getRedis } from "@/lib/queue/connection";

interface RateLimitConfig {
  type: "hourly" | "daily" | "monthly";
  limit: number;
  windowSeconds: number;
}

const PLATFORM_LIMITS: Record<string, RateLimitConfig[]> = {
  x: [
    { type: "monthly", limit: 500, windowSeconds: 30 * 24 * 60 * 60 },
    { type: "daily", limit: 50, windowSeconds: 24 * 60 * 60 },
  ],
  instagram: [
    { type: "daily", limit: 25, windowSeconds: 24 * 60 * 60 },
    { type: "hourly", limit: 10, windowSeconds: 60 * 60 },
  ],
  tiktok: [{ type: "daily", limit: 10, windowSeconds: 24 * 60 * 60 }],
  youtube: [{ type: "daily", limit: 6, windowSeconds: 24 * 60 * 60 }],
  linkedin: [{ type: "daily", limit: 20, windowSeconds: 24 * 60 * 60 }],
};

/**
 * Check if user can publish to a platform.
 * Returns { allowed: boolean, retryAfterSeconds?: number }
 */
export async function canPublish(
  userId: string,
  platform: string,
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const limits = PLATFORM_LIMITS[platform];
  if (!limits) return { allowed: true };

  const redis = getRedis();

  for (const limit of limits) {
    const key = `rate:${userId}:${platform}:${limit.type}`;
    const current = await redis.get<number>(key);

    if (current !== null && current >= limit.limit) {
      const ttl = await redis.ttl(key);
      return {
        allowed: false,
        retryAfterSeconds: ttl > 0 ? ttl : limit.windowSeconds,
      };
    }
  }

  return { allowed: true };
}

/**
 * Increment rate limit counter after a successful publish.
 */
export async function recordPublish(
  userId: string,
  platform: string,
): Promise<void> {
  const limits = PLATFORM_LIMITS[platform];
  if (!limits) return;

  const redis = getRedis();

  for (const limit of limits) {
    const key = `rate:${userId}:${platform}:${limit.type}`;
    const current = await redis.get<number>(key);

    if (current === null) {
      await redis.set(key, 1, { ex: limit.windowSeconds });
    } else {
      await redis.incr(key);
    }
  }
}
