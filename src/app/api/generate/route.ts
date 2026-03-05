import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { createClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PROMPT_TEMPLATES, buildPrompt } from "@/lib/ai/prompt-templates";
import { callLiteLLM } from "@/lib/ai/litellm-client";
import { findWinningExamples } from "@/lib/ai/embedding-pipeline";
import type { BrandVoiceSettings, Platform } from "@/types/ai";

const GenerateStreamSchema = z.object({
  topic: z.string().min(1),
  platforms: z
    .array(z.enum(["x", "instagram", "tiktok", "youtube", "linkedin"]))
    .min(1),
  variation_count: z.number().int().min(1).max(5).optional().default(3),
  org_id: z.string().uuid().optional(),
  brand_voice_override: z
    .object({
      tone: z.enum(["formal", "casual", "professional", "friendly"]).optional(),
      keywords: z.array(z.string()).optional(),
      avoid_words: z.array(z.string()).optional(),
      personality: z.string().optional(),
      example_posts: z.array(z.string()).optional(),
    })
    .optional(),
});

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = GenerateStreamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const orgId = request.headers.get("X-Org-Id") || parsed.data.org_id;
  if (!orgId) {
    return NextResponse.json(
      { error: "org_id required", code: "MISSING_ORG_ID" },
      { status: 400 },
    );
  }

  // Verify org membership
  const { data: membership } = await supabase
    .from("sns_org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", session.user.id)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: "Not a member of this organization", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  if (membership.role === "viewer") {
    return NextResponse.json(
      { error: "Viewers cannot generate content", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      try {
        const service = getServiceClient();

        const { data: org } = await service
          .from("sns_organizations")
          .select("brand_voice_settings")
          .eq("id", orgId)
          .single();

        const baseBrandVoice: BrandVoiceSettings =
          (org?.brand_voice_settings as BrandVoiceSettings) || {
            tone: "professional",
            keywords: [],
            avoid_words: [],
            personality: "",
            example_posts: [],
          };

        const mergedBrandVoice: BrandVoiceSettings = {
          ...baseBrandVoice,
          ...(parsed.data.brand_voice_override || {}),
        };

        const brandVoiceStr = `Tone: ${mergedBrandVoice.tone}. Keywords: ${mergedBrandVoice.keywords.join(", ")}. Personality: ${mergedBrandVoice.personality}. Avoid: ${mergedBrandVoice.avoid_words.join(", ")}`;

        controller.enqueue(
          encoder.encode(
            sseEvent("start", {
              topic: parsed.data.topic,
              platforms: parsed.data.platforms,
              variation_count: parsed.data.variation_count,
            }),
          ),
        );

        const variations: Array<{
          variation_id: number;
          adaptations: Record<
            string,
            {
              content: string;
              hashtags: string[];
              metadata?: Record<string, unknown>;
            }
          >;
        }> = [];

        for (let v = 0; v < parsed.data.variation_count; v++) {
          const adaptations: Record<
            string,
            { content: string; hashtags: string[] }
          > = {};

          for (const platform of parsed.data.platforms as Platform[]) {
            controller.enqueue(
              encoder.encode(
                sseEvent("status", {
                  phase: "generating",
                  variation_id: v + 1,
                  platform,
                }),
              ),
            );

            const examples = await findWinningExamples(
              parsed.data.topic,
              orgId,
              platform,
              3,
            );
            const examplesStr =
              examples.length > 0
                ? examples
                    .map((e, i) => `Example ${i + 1}: ${e.content}`)
                    .join("\n")
                : "No previous examples available.";

            const template = PROMPT_TEMPLATES[platform];
            const messages = buildPrompt(template, {
              topic: parsed.data.topic,
              brandVoice: brandVoiceStr,
              examples: examplesStr,
            });

            messages.push({
              role: "user",
              content: `Generate variation ${v + 1} of ${parsed.data.variation_count}. Each variation should have a different angle or hook. Return JSON: { "content": "...", "hashtags": ["..."] }`,
            });

            const response = await callLiteLLM({
              messages,
              temperature: 0.8 + v * 0.05,
            });

            const responseText = response.choices?.[0]?.message?.content || "";

            let parsedOut: { content: string; hashtags: string[] };
            try {
              const jsonMatch = responseText.match(/\{[\s\S]*\}/);
              parsedOut = jsonMatch
                ? (JSON.parse(jsonMatch[0]) as {
                    content: string;
                    hashtags: string[];
                  })
                : { content: responseText, hashtags: [] };
            } catch {
              parsedOut = { content: responseText, hashtags: [] };
            }

            adaptations[platform] = parsedOut;

            controller.enqueue(
              encoder.encode(
                sseEvent("chunk", {
                  variation_id: v + 1,
                  platform,
                  ...parsedOut,
                }),
              ),
            );
          }

          const variation = { variation_id: v + 1, adaptations };
          variations.push(variation);
          controller.enqueue(
            encoder.encode(sseEvent("variation_done", { variation_id: v + 1 })),
          );
        }

        controller.enqueue(encoder.encode(sseEvent("done", { variations })));
        controller.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Generation failed";
        controller.enqueue(
          encoder.encode(sseEvent("error", { error: message })),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
