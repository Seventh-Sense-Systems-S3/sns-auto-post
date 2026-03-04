import { z } from "zod/v4";

// Post status enum
export const PostStatus = z.enum([
  "draft",
  "pending_approval",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "failed",
]);
export type PostStatus = z.infer<typeof PostStatus>;

// Platform enum
export const Platform = z.enum([
  "x",
  "instagram",
  "tiktok",
  "youtube",
  "linkedin",
]);
export type Platform = z.infer<typeof Platform>;

// Create post schema
export const CreatePostSchema = z.object({
  title: z.string().optional(),
  content_original: z.string().min(1, "Content is required"),
  org_id: z.string().uuid("Valid org_id is required"),
  scheduled_at: z.string().datetime().optional(),
  tags: z.array(z.string()).optional(),
  media_urls: z.array(z.string().url()).optional(),
  platforms: z.array(Platform).optional(),
});
export type CreatePostInput = z.infer<typeof CreatePostSchema>;

// Update post schema
export const UpdatePostSchema = z.object({
  title: z.string().optional(),
  content_original: z.string().min(1).optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
  tags: z.array(z.string()).optional(),
  media_urls: z.array(z.string().url()).optional(),
  status: PostStatus.optional(),
});
export type UpdatePostInput = z.infer<typeof UpdatePostSchema>;

// Post type (DB row)
export interface Post {
  id: string;
  user_id: string;
  org_id: string | null;
  title: string | null;
  content_original: string;
  status: PostStatus;
  scheduled_at: string | null;
  tags: string[] | null;
  media_urls: string[] | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

// Post adaptation type
export interface PostAdaptation {
  id: string;
  post_id: string;
  platform: Platform;
  content_adapted: string;
  media_ids: string[] | null;
  constraints_applied: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Post publish type
export interface PostPublish {
  id: string;
  post_id: string;
  platform: string;
  status: "pending" | "publishing" | "published" | "failed";
  platform_post_id: string | null;
  platform_url: string | null;
  error_message: string | null;
  retry_count: number;
  published_at: string | null;
  created_at: string;
}

// Post with adaptations (for detail view)
export interface PostWithAdaptations extends Post {
  adaptations: PostAdaptation[];
}
