import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BrandVoiceSchema } from "@/types/ai";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params;
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

  // Verify membership
  const { data: membership } = await supabase
    .from("sns_org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", session.user.id)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: "Not a member", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const { data: org } = await supabase
    .from("sns_organizations")
    .select("brand_voice_settings")
    .eq("id", orgId)
    .single();

  return NextResponse.json({
    brand_voice: org?.brand_voice_settings || {},
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params;
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

  // Only admin+ can update brand voice
  const { data: membership } = await supabase
    .from("sns_org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", session.user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json(
      { error: "Admin access required", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const parsed = BrandVoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid brand voice settings",
        code: "VALIDATION_ERROR",
      },
      { status: 400 },
    );
  }

  // Merge with existing settings
  const { data: existing } = await supabase
    .from("sns_organizations")
    .select("brand_voice_settings")
    .eq("id", orgId)
    .single();

  const merged = {
    ...(existing?.brand_voice_settings || {}),
    ...parsed.data,
  };

  const { error } = await supabase
    .from("sns_organizations")
    .update({
      brand_voice_settings: merged,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orgId);

  if (error) {
    return NextResponse.json(
      { error: error.message, code: "UPDATE_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({ brand_voice: merged });
}
