import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CreateOrgSchema } from "@/types/organization";

export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json();
    const parsed = CreateOrgSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues.map((i) => i.message).join("; "),
          code: "VALIDATION_ERROR",
        },
        { status: 400 },
      );
    }

    // Create the organization
    const { data: org, error: orgError } = await supabase
      .from("sns_organizations")
      .insert({
        name: parsed.data.name,
        slug: parsed.data.slug,
      })
      .select()
      .single();

    if (orgError) {
      // Handle unique slug violation
      if (orgError.code === "23505") {
        return NextResponse.json(
          { error: "Organization slug already taken", code: "SLUG_CONFLICT" },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: orgError.message, code: "DB_ERROR" },
        { status: 500 },
      );
    }

    // Add creator as owner
    const { error: memberError } = await supabase
      .from("sns_org_members")
      .insert({
        org_id: org.id,
        user_id: user.id,
        role: "owner",
      });

    if (memberError) {
      // Rollback: delete the org if member creation fails
      await supabase.from("sns_organizations").delete().eq("id", org.id);
      return NextResponse.json(
        { error: memberError.message, code: "DB_ERROR" },
        { status: 500 },
      );
    }

    return NextResponse.json(org, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
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

    // Get all orgs the user belongs to via sns_org_members join
    const { data: memberships, error } = await supabase
      .from("sns_org_members")
      .select(
        `
        role,
        joined_at,
        org:sns_organizations (
          id,
          name,
          slug,
          logo_url,
          plan,
          created_at,
          updated_at
        )
      `,
      )
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json(
        { error: error.message, code: "DB_ERROR" },
        { status: 500 },
      );
    }

    const orgs = memberships.map((m) => ({
      ...m.org,
      role: m.role,
      joined_at: m.joined_at,
    }));

    return NextResponse.json({ data: orgs });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
