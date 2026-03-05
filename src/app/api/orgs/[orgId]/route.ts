import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UpdateOrgSchema } from "@/types/organization";

type RouteContext = { params: Promise<{ orgId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { orgId } = await context.params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
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
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this organization", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const { data: org, error } = await supabase
      .from("sns_organizations")
      .select("*")
      .eq("id", orgId)
      .single();

    if (error || !org) {
      return NextResponse.json(
        { error: "Organization not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return NextResponse.json(org);
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { orgId } = await context.params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    // Verify membership + permissions
    const { data: membership } = await supabase
      .from("sns_org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this organization", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    if (membership.role !== "owner" && membership.role !== "admin") {
      return NextResponse.json(
        {
          error: "Only owners and admins can update organization settings",
          code: "FORBIDDEN",
        },
        { status: 403 },
      );
    }

    const body = await request.json();
    const parsed = UpdateOrgSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues.map((i) => i.message).join("; "),
          code: "VALIDATION_ERROR",
        },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("sns_organizations")
      .update({
        ...parsed.data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orgId);

    if (error) {
      return NextResponse.json(
        { error: error.message, code: "DB_ERROR" },
        { status: 500 },
      );
    }

    const { data: org } = await supabase
      .from("sns_organizations")
      .select("*")
      .eq("id", orgId)
      .single();

    return NextResponse.json(org);
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
