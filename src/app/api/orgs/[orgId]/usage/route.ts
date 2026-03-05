import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ orgId: string }> };

const PLAN_LIMITS: Record<
  string,
  { members: number; postsPerMonth: number; generationsPerMonth: number }
> = {
  free: { members: 3, postsPerMonth: 30, generationsPerMonth: 50 },
  starter: { members: 10, postsPerMonth: 200, generationsPerMonth: 500 },
  pro: { members: 50, postsPerMonth: 2000, generationsPerMonth: 5000 },
  enterprise: {
    members: 500,
    postsPerMonth: 20000,
    generationsPerMonth: 50000,
  },
};

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

    const { data: org } = await supabase
      .from("sns_organizations")
      .select("plan")
      .eq("id", orgId)
      .single();

    const plan = org?.plan ?? "free";
    const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    const startIso = startOfMonth.toISOString();

    const [
      { count: memberCount },
      { count: postsMonth },
      { count: publishes },
    ] = await Promise.all([
      supabase
        .from("sns_org_members")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId),
      supabase
        .from("sns_posts")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .gte("created_at", startIso),
      supabase
        .from("sns_post_publishes")
        .select(
          `
            id,
            post:sns_posts!inner ( org_id )
          `,
          { count: "exact", head: true },
        )
        .eq("post.org_id", orgId)
        .gte("created_at", startIso),
    ]);

    return NextResponse.json({
      plan,
      limits,
      usage: {
        members: memberCount ?? 0,
        postsThisMonth: postsMonth ?? 0,
        publishesThisMonth: publishes ?? 0,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
