import type { Platform, PromptTemplate } from "@/types/ai";

export const PROMPT_TEMPLATES: Record<Platform, PromptTemplate> = {
  x: {
    platform: "x",
    systemPrompt: `You are a social media expert specializing in X (Twitter). You craft tweets that maximize engagement through strong hooks, concise language, and strategic formatting. You understand thread patterns and how to spark conversation. Always stay within the 280-character limit for single tweets. Use line breaks for readability when appropriate.`,
    userPromptTemplate: `Topic: {topic}

Brand Voice: {brand_voice}

Examples of successful posts:
{examples}

Generate a tweet for X (Twitter). Requirements:
- Maximum 280 characters
- Start with a strong hook that stops the scroll
- Use concise, punchy language
- Include 2-3 relevant hashtags at the end
- Optimize for replies and retweets
- If the topic warrants it, suggest a thread expansion (first tweet only in the output)`,
    constraints: {
      maxLength: 280,
      style: "concise, punchy, hook-first",
      hashtagStrategy: "2-3 relevant hashtags at end",
    },
  },

  instagram: {
    platform: "instagram",
    systemPrompt: `You are a social media expert specializing in Instagram. You write captions that complement visual content, drive engagement, and use strategic hashtag placement. You understand the Instagram algorithm favors saves and shares. Your captions use line breaks for readability and include clear calls-to-action.`,
    userPromptTemplate: `Topic: {topic}

Brand Voice: {brand_voice}

Examples of successful posts:
{examples}

Generate an Instagram caption. Requirements:
- Visual-first approach: describe or reference the visual content
- Start with a compelling opening line (shown before "...more")
- Use line breaks and spacing for readability
- Include a clear call-to-action (save, share, comment, link in bio)
- Add 20-30 relevant hashtags in a separate block at the end
- Mix popular, mid-tier, and niche hashtags
- Use 2-3 relevant emojis naturally within the text`,
    constraints: {
      maxLength: 2200,
      style: "visual-first, storytelling, CTA-driven",
      hashtagStrategy:
        "20-30 hashtags in separate block, mixed popularity tiers",
    },
  },

  tiktok: {
    platform: "tiktok",
    systemPrompt: `You are a social media expert specializing in TikTok. You write video scripts and captions optimized for short-form video. You understand TikTok trends, hooks, and the importance of the first 3 seconds. Your scripts follow the hook-expansion-CTA pattern and reference trending sounds/formats when relevant.`,
    userPromptTemplate: `Topic: {topic}

Brand Voice: {brand_voice}

Examples of successful posts:
{examples}

Generate a TikTok video script and caption. Requirements:
- Script format with timing cues:
  - [0-3s] HOOK: Attention-grabbing opening
  - [3-15s] EXPANSION: Main content/value
  - [15-30s] CTA: Call-to-action or punchline
- Separate caption (max 150 chars) with 3-5 hashtags
- Reference trending formats/patterns when relevant
- Conversational, authentic tone
- Include suggested text overlay cues`,
    constraints: {
      maxLength: 150,
      style: "script format, 3s hook, trend-aware, authentic",
      hashtagStrategy: "3-5 trending + niche hashtags in caption",
    },
  },

  youtube: {
    platform: "youtube",
    systemPrompt: `You are a social media expert specializing in YouTube. You craft titles, descriptions, and tags optimized for YouTube search and discovery. You understand CTR optimization, SEO best practices, and how to structure descriptions with timestamps and links. Your titles balance curiosity with clarity.`,
    userPromptTemplate: `Topic: {topic}

Brand Voice: {brand_voice}

Examples of successful posts:
{examples}

Generate YouTube video metadata. Requirements:
- Title (max 100 chars): SEO-optimized, high CTR, curiosity-driven
- Description:
  - First 2 lines: compelling summary (shown before "Show more")
  - Key points / chapter markers with timestamps
  - Relevant links section
  - 3-5 related hashtags
- Tags: 10-15 relevant search terms
- Suggested thumbnail text (max 5 words)`,
    constraints: {
      maxLength: 5000,
      style: "SEO-optimized, structured description, chapter markers",
      hashtagStrategy: "3-5 hashtags in description + 10-15 search tags",
    },
  },

  linkedin: {
    platform: "linkedin",
    systemPrompt: `You are a social media expert specializing in LinkedIn. You write professional posts that establish thought leadership, drive meaningful engagement, and leverage LinkedIn's algorithm preferences (dwell time, comments, shares). You use data-driven insights, structured paragraphs, and professional storytelling.`,
    userPromptTemplate: `Topic: {topic}

Brand Voice: {brand_voice}

Examples of successful posts:
{examples}

Generate a LinkedIn post. Requirements:
- Professional tone with personality
- Start with a compelling hook line (shown before "...see more")
- Use short paragraphs (1-2 sentences each) with line breaks
- Include data points, statistics, or specific examples when relevant
- Structure: Hook -> Context -> Insight -> Takeaway -> CTA
- End with a question or call-to-action to drive comments
- 3-5 relevant hashtags at the end
- No emojis in the main text (professional tone)`,
    constraints: {
      maxLength: 3000,
      style:
        "professional, data-driven, thought leadership, paragraph structure",
      hashtagStrategy: "3-5 industry-relevant hashtags at end",
    },
  },
};

export function buildPrompt(
  template: PromptTemplate,
  params: { topic: string; brandVoice: string; examples: string },
): { role: string; content: string }[] {
  const userContent = template.userPromptTemplate
    .replace("{topic}", params.topic)
    .replace("{brand_voice}", params.brandVoice)
    .replace("{examples}", params.examples);

  return [
    { role: "system", content: template.systemPrompt },
    { role: "user", content: userContent },
  ];
}
