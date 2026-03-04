import type {
  Platform,
  GeneratedContent,
  BrandVoiceSettings,
} from "@/types/ai";
import { callLiteLLM } from "./litellm-client";
import { PROMPT_TEMPLATES, buildPrompt } from "./prompt-templates";
import { findWinningExamples } from "./embedding-pipeline";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Generate multi-platform content variations for a topic.
 *
 * Flow:
 * 1. Load org's brand voice settings
 * 2. For each variation x platform, find winning examples via pgvector
 * 3. Build platform-specific prompts with few-shot examples
 * 4. Call LiteLLM proxy to generate content
 * 5. Parse JSON responses into structured adaptations
 */
export async function generateContent(params: {
  orgId: string;
  topic: string;
  platforms: Platform[];
  variationCount?: number;
}): Promise<GeneratedContent[]> {
  const { orgId, topic, platforms, variationCount = 3 } = params;
  const supabase = getServiceClient();

  // 1. Get org's brand voice settings
  const { data: org } = await supabase
    .from("sns_organizations")
    .select("brand_voice_settings")
    .eq("id", orgId)
    .single();

  const brandVoice: BrandVoiceSettings =
    (org?.brand_voice_settings as BrandVoiceSettings) || {
      tone: "professional",
      keywords: [],
      avoid_words: [],
      personality: "",
      example_posts: [],
    };

  const brandVoiceStr = `Tone: ${brandVoice.tone}. Keywords: ${brandVoice.keywords.join(", ")}. Personality: ${brandVoice.personality}. Avoid: ${brandVoice.avoid_words.join(", ")}`;

  // 2. Generate variations
  const variations: GeneratedContent[] = [];

  for (let v = 0; v < variationCount; v++) {
    const adaptations: Record<
      string,
      {
        content: string;
        hashtags: string[];
        metadata?: Record<string, unknown>;
      }
    > = {};

    for (const platform of platforms) {
      // Find winning examples for this platform via pgvector similarity search
      const examples = await findWinningExamples(topic, orgId, platform, 3);
      const examplesStr =
        examples.length > 0
          ? examples.map((e, i) => `Example ${i + 1}: ${e.content}`).join("\n")
          : "No previous examples available.";

      const template = PROMPT_TEMPLATES[platform];
      const messages = buildPrompt(template, {
        topic,
        brandVoice: brandVoiceStr,
        examples: examplesStr,
      });

      // Add variation instruction
      messages.push({
        role: "user",
        content: `Generate variation ${v + 1} of ${variationCount}. Each variation should have a different angle or hook. Return JSON: { "content": "...", "hashtags": ["..."] }`,
      });

      const response = await callLiteLLM({
        messages,
        temperature: 0.8 + v * 0.05, // Slightly increase temp for variety
      });

      const responseText = response.choices?.[0]?.message?.content || "";

      // Parse JSON from response
      let parsed: { content: string; hashtags: string[] };
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        parsed = jsonMatch
          ? JSON.parse(jsonMatch[0])
          : { content: responseText, hashtags: [] };
      } catch {
        parsed = { content: responseText, hashtags: [] };
      }

      adaptations[platform] = parsed;
    }

    variations.push({
      variation_id: v + 1,
      adaptations: adaptations as GeneratedContent["adaptations"],
    });
  }

  return variations;
}
