import { z } from "zod/v4";

export type Platform = "x" | "instagram" | "tiktok" | "youtube" | "linkedin";

export interface GenerationRequest {
  model?: string;
  messages: { role: string; content: string }[];
  max_tokens?: number;
  temperature?: number;
}

export interface PromptTemplate {
  platform: Platform;
  systemPrompt: string;
  userPromptTemplate: string;
  constraints: {
    maxLength: number;
    style: string;
    hashtagStrategy: string;
  };
}

export interface GeneratedContent {
  variation_id: number;
  adaptations: Record<
    Platform,
    {
      content: string;
      hashtags: string[];
      metadata?: Record<string, unknown>;
    }
  >;
}

export interface BrandVoiceSettings {
  tone: "formal" | "casual" | "professional" | "friendly";
  keywords: string[];
  avoid_words: string[];
  personality: string;
  example_posts: string[];
}

export const GeneratePostSchema = z.object({
  topic: z.string().min(1),
  platforms: z
    .array(z.enum(["x", "instagram", "tiktok", "youtube", "linkedin"]))
    .min(1),
  variation_count: z.number().int().min(1).max(5).optional().default(3),
});

export const BrandVoiceSchema = z.object({
  tone: z.enum(["formal", "casual", "professional", "friendly"]).optional(),
  keywords: z.array(z.string()).optional(),
  avoid_words: z.array(z.string()).optional(),
  personality: z.string().optional(),
  example_posts: z.array(z.string()).optional(),
});
