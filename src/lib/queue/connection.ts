import { Redis } from "@upstash/redis";
import { Client as QStashClient } from "@upstash/qstash";

let redis: Redis | null = null;
let qstash: QStashClient | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error(
        "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set",
      );
    }
    redis = new Redis({ url, token });
  }
  return redis;
}

export function getQStash(): QStashClient {
  if (!qstash) {
    const token = process.env.QSTASH_TOKEN;
    if (!token) {
      throw new Error("QSTASH_TOKEN must be set");
    }
    qstash = new QStashClient({ token });
  }
  return qstash;
}
