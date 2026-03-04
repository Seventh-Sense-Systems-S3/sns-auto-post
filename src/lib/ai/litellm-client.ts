import type { GenerationRequest } from "@/types/ai";

const LITELLM_URL = process.env.LITELLM_PROXY_URL || "http://localhost:4000";

export async function callLiteLLM(req: GenerationRequest) {
  const response = await fetch(`${LITELLM_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: req.model || "claude-sonnet-4-5-20250929",
      messages: req.messages,
      max_tokens: req.max_tokens || 2000,
      temperature: req.temperature || 0.8,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `LiteLLM error: ${response.status} ${await response.text()}`,
    );
  }

  return response.json();
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${LITELLM_URL}/v1/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Embedding error: ${response.status} ${await response.text()}`,
    );
  }

  const data = await response.json();
  return data.data[0].embedding;
}
