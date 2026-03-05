"use client";

import * as React from "react";
import useSWR from "swr";

import { useOrg } from "@/components/tenant/org-context";
import { apiFetch, apiPost } from "@/lib/api/fetcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { BrandVoiceSettings, Platform } from "@/types/ai";
import type { Post } from "@/types/post";
import type { CreatePostInput } from "@/types/post";

type GenerateChunkEvent = {
  variation_id: number;
  platform: Platform;
  content: string;
  hashtags: string[];
};

type GenerateDoneEvent = {
  variations: Array<{
    variation_id: number;
    adaptations: Record<string, { content: string; hashtags: string[] }>;
  }>;
};

type WinningExample = { post_id: string; similarity: number; content: string };

export default function GeneratePage() {
  const { activeOrg } = useOrg();
  const orgId = activeOrg?.id;

  const [topic, setTopic] = React.useState("");
  const [platforms, setPlatforms] = React.useState<Platform[]>(["x"]);
  const [variationCount, setVariationCount] = React.useState(3);

  const { data: brandVoiceResp } = useSWR<{
    brand_voice: Partial<BrandVoiceSettings>;
  }>(orgId ? `/api/orgs/${orgId}/brand-voice` : null, (url: string) =>
    apiFetch<{ brand_voice: Partial<BrandVoiceSettings> }>(url),
  );

  const brandVoice = brandVoiceResp?.brand_voice ?? {};
  const [tone, setTone] =
    React.useState<BrandVoiceSettings["tone"]>("professional");
  const [keywords, setKeywords] = React.useState("");
  const [avoid, setAvoid] = React.useState("");
  const [personality, setPersonality] = React.useState("");

  React.useEffect(() => {
    setTone((brandVoice.tone as BrandVoiceSettings["tone"]) ?? "professional");
    setKeywords((brandVoice.keywords ?? []).join(", "));
    setAvoid((brandVoice.avoid_words ?? []).join(", "));
    setPersonality(brandVoice.personality ?? "");
  }, [brandVoiceResp]); // eslint-disable-line react-hooks/exhaustive-deps

  const primaryPlatform = platforms[0] ?? "x";
  const { data: examplesResp } = useSWR<{ data: WinningExample[] }>(
    orgId && topic.trim().length > 0
      ? `/api/analytics/winning-posts?org_id=${encodeURIComponent(orgId)}&platform=${encodeURIComponent(primaryPlatform)}&topic=${encodeURIComponent(topic)}&count=3`
      : null,
    (url: string) => apiFetch<{ data: WinningExample[] }>(url, { orgId }),
  );

  const [isGenerating, setIsGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [chunks, setChunks] = React.useState<
    Record<number, Record<string, GenerateChunkEvent>>
  >({});
  const [done, setDone] = React.useState<GenerateDoneEvent | null>(null);

  const [savedPostId, setSavedPostId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function generate() {
    if (!orgId) return;
    setIsGenerating(true);
    setError(null);
    setChunks({});
    setDone(null);
    setSavedPostId(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Org-Id": orgId,
        },
        body: JSON.stringify({
          topic,
          platforms,
          variation_count: variationCount,
          brand_voice_override: {
            tone,
            keywords: splitCsv(keywords),
            avoid_words: splitCsv(avoid),
            personality,
          },
        }),
      });

      if (!res.ok || !res.body) {
        const msg = await res.text();
        throw new Error(msg || `Request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done: doneReading, value } = await reader.read();
        if (doneReading) break;
        buffer += decoder.decode(value, { stream: true });

        const events = parseSseBuffer(buffer);
        buffer = events.rest;
        for (const ev of events.events) {
          if (ev.event === "chunk") {
            const payload = ev.data as GenerateChunkEvent;
            setChunks((prev) => {
              const byVar = prev[payload.variation_id] ?? {};
              return {
                ...prev,
                [payload.variation_id]: {
                  ...byVar,
                  [payload.platform]: payload,
                },
              };
            });
          }
          if (ev.event === "done") {
            setDone(ev.data as GenerateDoneEvent);
          }
          if (ev.event === "error") {
            const msg = getErrorMessage(ev.data) ?? "Generation failed";
            setError(msg);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveDraft(payload: { content: string; tags: string[] }) {
    if (!orgId) return;
    setSaving(true);
    try {
      const postBody: CreatePostInput = {
        title: `AI: ${topic}`.slice(0, 120),
        content_original: payload.content,
        org_id: orgId,
        tags: Array.from(new Set(["ai_generated", ...payload.tags])),
        platforms: platforms as CreatePostInput["platforms"],
      };
      const post = await apiPost<Post, CreatePostInput>("/api/posts", postBody);
      setSavedPostId(post.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function requestApproval() {
    if (!savedPostId) return;
    try {
      await apiFetch(`/api/posts/${savedPostId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending_approval" }),
      });
      window.location.href = "/posts";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to request approval");
    }
  }

  const variations = buildVariationsFromChunks(chunks, done);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">AI Studio</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Generate platform-specific drafts, then save to your approval flow.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Generate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="topic">Topic</Label>
              <Input
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. AI×運用の勝ちパターン"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Platforms</Label>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    "x",
                    "instagram",
                    "tiktok",
                    "youtube",
                    "linkedin",
                  ] as Platform[]
                ).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p, platforms, setPlatforms)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${
                      platforms.includes(p)
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="tone">Tone</Label>
                <select
                  id="tone"
                  className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
                  value={tone}
                  onChange={(e) =>
                    setTone(e.target.value as BrandVoiceSettings["tone"])
                  }
                >
                  <option value="formal">formal</option>
                  <option value="casual">casual</option>
                  <option value="professional">professional</option>
                  <option value="friendly">friendly</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="count">Variations</Label>
                <select
                  id="count"
                  className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
                  value={variationCount}
                  onChange={(e) =>
                    setVariationCount(parseInt(e.target.value, 10))
                  }
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Workspace role</Label>
                <div className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm flex items-center capitalize">
                  {activeOrg?.role ?? "—"}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="keywords">Brand keywords (comma separated)</Label>
              <Input
                id="keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g. 実装, 検証, 静寂"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="avoid">Avoid words (comma separated)</Label>
              <Input
                id="avoid"
                value={avoid}
                onChange={(e) => setAvoid(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="personality">Personality</Label>
              <Input
                id="personality"
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={generate}
                disabled={isGenerating || !topic.trim()}
              >
                {isGenerating ? "Generating…" : "Generate"}
              </Button>
              <Button
                variant="outline"
                onClick={generate}
                disabled={isGenerating || !topic.trim()}
              >
                Regenerate
              </Button>
            </div>

            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reference: winning posts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(examplesResp?.data ?? []).map((ex) => (
              <div
                key={ex.post_id}
                className="rounded-md border border-zinc-200 p-3"
              >
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span className="font-mono">{ex.post_id.slice(0, 8)}…</span>
                  <span>sim {(ex.similarity * 100).toFixed(1)}%</span>
                </div>
                <div className="mt-2 text-sm text-zinc-800 whitespace-pre-wrap">
                  {ex.content}
                </div>
              </div>
            ))}
            {(examplesResp?.data ?? []).length === 0 ? (
              <div className="text-sm text-zinc-500">
                Type a topic to fetch similar high-engagement examples.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {variations.length === 0 ? (
              <div className="text-sm text-zinc-500">
                Generate to see streaming results here.
              </div>
            ) : (
              variations.map((v) => (
                <div key={v.variation_id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">
                      Variation {v.variation_id}
                    </div>
                    <Badge variant="secondary">
                      {Object.keys(v.adaptations).length} platforms
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {Object.entries(v.adaptations).map(([p, a]) => (
                      <div
                        key={p}
                        className="rounded-md border border-zinc-200 p-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-medium uppercase text-zinc-500">
                            {p}
                          </div>
                          <Button
                            size="sm"
                            onClick={() =>
                              saveDraft({
                                content: a.content,
                                tags: a.hashtags,
                              })
                            }
                            disabled={saving}
                          >
                            {saving ? "Saving…" : "Save draft"}
                          </Button>
                        </div>
                        <Textarea className="mt-2" value={a.content} readOnly />
                        {a.hashtags.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {a.hashtags.slice(0, 8).map((h) => (
                              <Badge key={h} variant="default">
                                {h}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}

            {savedPostId ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                Draft saved: <span className="font-mono">{savedPostId}</span>
                <div className="mt-2 flex gap-2">
                  <Button onClick={() => (window.location.href = "/posts")}>
                    Go to posts
                  </Button>
                  <Button variant="outline" onClick={requestApproval}>
                    Request approval
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <HistoryLog orgId={orgId ?? null} />
      </div>
    </div>
  );
}

function HistoryLog({ orgId }: { orgId: string | null }) {
  const { data } = useSWR<{ data: Post[] }>(
    orgId ? `/api/posts?org_id=${encodeURIComponent(orgId)}&limit=30` : null,
    (url: string) =>
      apiFetch<{ data: Post[] }>(url, { orgId: orgId ?? undefined }),
  );

  const rows = (data?.data ?? [])
    .filter((p) => (p.tags ?? []).includes("ai_generated"))
    .slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((p) => (
          <div key={p.id} className="rounded-md border border-zinc-200 p-3">
            <div className="flex items-center justify-between">
              <div className="truncate text-sm font-medium">
                {p.title ?? "AI draft"}
              </div>
              <Badge variant="secondary">{p.status}</Badge>
            </div>
            <div className="mt-1 truncate text-sm text-zinc-600">
              {p.content_original}
            </div>
          </div>
        ))}
        {rows.length === 0 ? (
          <div className="text-sm text-zinc-500">
            No AI drafts yet. Save a generated variation to see it here.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function togglePlatform(
  p: Platform,
  current: Platform[],
  set: React.Dispatch<React.SetStateAction<Platform[]>>,
) {
  set((prev) => {
    const has = prev.includes(p);
    if (has) {
      const next = prev.filter((x) => x !== p);
      return next.length > 0 ? next : prev;
    }
    return [...prev, p];
  });
}

function splitCsv(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildVariationsFromChunks(
  chunks: Record<number, Record<string, GenerateChunkEvent>>,
  done: GenerateDoneEvent | null,
) {
  if (done?.variations?.length) {
    return done.variations.map((v) => ({
      variation_id: v.variation_id,
      adaptations: Object.fromEntries(
        Object.entries(v.adaptations).map(([k, a]) => [k, a]),
      ) as Record<string, { content: string; hashtags: string[] }>,
    }));
  }

  const ids = Object.keys(chunks)
    .map((n) => parseInt(n, 10))
    .sort((a, b) => a - b);
  return ids.map((id) => ({
    variation_id: id,
    adaptations: Object.fromEntries(
      Object.entries(chunks[id] ?? {}).map(([p, ev]) => [
        p,
        { content: ev.content, hashtags: ev.hashtags },
      ]),
    ),
  }));
}

function parseSseBuffer(buffer: string): {
  events: Array<{ event: string; data: unknown }>;
  rest: string;
} {
  const events: Array<{ event: string; data: unknown }> = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";

  for (const part of parts) {
    const lines = part.split("\n").filter(Boolean);
    let event = "message";
    let dataStr = "";
    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataStr += line.slice("data:".length).trim();
      }
    }
    if (!dataStr) continue;
    try {
      events.push({ event, data: JSON.parse(dataStr) });
    } catch {
      events.push({ event, data: dataStr });
    }
  }

  return { events, rest };
}

function getErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  if (!("error" in data)) return null;
  const err = (data as { error?: unknown }).error;
  return typeof err === "string" ? err : null;
}
