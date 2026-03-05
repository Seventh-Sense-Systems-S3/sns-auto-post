import { NextRequest, NextResponse } from "next/server";
import { requireOrgScope } from "@/lib/api/org-scope";
import { findWinningExamples } from "@/lib/ai/embedding-pipeline";

export async function GET(request: NextRequest) {
  const ctx = await requireOrgScope(request);
  if (ctx instanceof NextResponse) return ctx;

  const topic = request.nextUrl.searchParams.get("topic") || "";
  const platform = request.nextUrl.searchParams.get("platform") || "x";
  const count = Math.min(
    Math.max(parseInt(request.nextUrl.searchParams.get("count") || "3", 10), 1),
    10,
  );

  if (!topic) {
    return NextResponse.json(
      { error: "topic is required", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  try {
    const examples = await findWinningExamples(
      topic,
      ctx.orgId,
      platform,
      count,
    );
    return NextResponse.json({ data: examples });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch examples";
    return NextResponse.json(
      { error: message, code: "ANALYTICS_ERROR" },
      { status: 500 },
    );
  }
}
