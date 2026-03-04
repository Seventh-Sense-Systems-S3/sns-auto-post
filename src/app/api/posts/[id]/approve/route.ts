import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
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

    // Check post exists and belongs to user
    const { data: post, error: fetchError } = await supabase
      .from("sns_posts")
      .select("status")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !post) {
      return NextResponse.json(
        { error: "Post not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (post.status !== "pending_approval") {
      return NextResponse.json(
        {
          error: "Can only approve posts with pending_approval status",
          code: "INVALID_STATUS",
        },
        { status: 409 },
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("sns_posts")
      .update({
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message, code: "DB_ERROR" },
        { status: 500 },
      );
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
