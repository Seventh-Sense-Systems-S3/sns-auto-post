import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OrgRole } from "@/types/organization";

export type OrgAuthContext = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  orgId: string;
  userId: string;
  role: OrgRole;
};

/**
 * Extract org_id from query or header and validate membership.
 * Returns either an OrgAuthContext or a NextResponse error.
 */
export async function requireOrgScope(
  request: NextRequest,
): Promise<OrgAuthContext | NextResponse> {
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

  const orgId =
    request.nextUrl.searchParams.get("org_id") ||
    request.headers.get("X-Org-Id");
  if (!orgId) {
    return NextResponse.json(
      {
        error: "org_id query parameter or X-Org-Id header is required",
        code: "MISSING_ORG_ID",
      },
      { status: 400 },
    );
  }

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

  return { supabase, orgId, userId: user.id, role: membership.role as OrgRole };
}
