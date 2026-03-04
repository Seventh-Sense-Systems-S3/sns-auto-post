import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

    // Verify the user is a member of this org
    const { data: membership, error: membershipError } = await supabase
      .from("sns_org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: "Not a member of this organization", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    // Get all members with user info
    const { data: members, error } = await supabase
      .from("sns_org_members")
      .select(
        `
        id,
        role,
        joined_at,
        invited_by,
        user:sns_users (
          id,
          email,
          name,
          avatar_url
        )
      `,
      )
      .eq("org_id", orgId)
      .order("joined_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: error.message, code: "DB_ERROR" },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: members });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
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

    // Verify the requesting user is owner or admin
    const { data: membership, error: membershipError } = await supabase
      .from("sns_org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: "Not a member of this organization", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    if (membership.role !== "owner" && membership.role !== "admin") {
      return NextResponse.json(
        {
          error: "Only owners and admins can remove members",
          code: "FORBIDDEN",
        },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { userId } = body as { userId: string };

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    // Prevent removing the last owner
    if (userId !== user.id) {
      const { data: targetMember } = await supabase
        .from("sns_org_members")
        .select("role")
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .single();

      if (targetMember?.role === "owner") {
        // Check if there are other owners
        const { count } = await supabase
          .from("sns_org_members")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("role", "owner");

        if (count !== null && count <= 1) {
          return NextResponse.json(
            {
              error: "Cannot remove the last owner of an organization",
              code: "LAST_OWNER",
            },
            { status: 409 },
          );
        }
      }
    }

    const { error: deleteError } = await supabase
      .from("sns_org_members")
      .delete()
      .eq("org_id", orgId)
      .eq("user_id", userId);

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message, code: "DB_ERROR" },
        { status: 500 },
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
