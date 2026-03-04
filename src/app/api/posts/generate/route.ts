import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GeneratePostSchema } from "@/types/ai";
import { generateContent } from "@/lib/ai/content-generator";

export async function POST(request: Request) {
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

  const body = await request.json();
  const parsed = GeneratePostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const orgId = request.headers.get("X-Org-Id") || body.org_id;
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

  try {
    const variations = await generateContent({
      orgId,
      topic: parsed.data.topic,
      platforms: parsed.data.platforms,
      variationCount: parsed.data.variation_count,
    });

    return NextResponse.json({ variations });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json(
      { error: message, code: "GENERATION_ERROR" },
      { status: 500 },
    );
  }
}
