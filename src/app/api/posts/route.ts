import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CreatePostSchema } from "@/types/post";

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
    const parsed = CreatePostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues.map((i) => i.message).join("; "),
          code: "VALIDATION_ERROR",
        },
        { status: 400 },
      );
    }

    const { platforms, ...postData } = parsed.data;

    const { data: post, error } = await supabase
      .from("sns_posts")
      .insert({
        user_id: user.id,
        status: "draft",
        ...postData,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message, code: "DB_ERROR" },
        { status: 500 },
      );
    }

    // Create adaptations for each target platform if specified
    if (platforms && platforms.length > 0) {
      const adaptations = platforms.map((platform) => ({
        post_id: post.id,
        platform,
        content_adapted: postData.content_original,
        constraints_applied: {},
      }));

      await supabase.from("sns_post_adaptations").insert(adaptations);
    }

    return NextResponse.json(post, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
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

    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const platform = searchParams.get("platform");
    const limit = Math.min(
      parseInt(searchParams.get("limit") || "20", 10),
      100,
    );
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    let query = supabase
      .from("sns_posts")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    // Filter by platform via sns_post_adaptations join
    if (platform) {
      const { data: adaptationPostIds } = await supabase
        .from("sns_post_adaptations")
        .select("post_id")
        .eq("platform", platform);

      if (adaptationPostIds && adaptationPostIds.length > 0) {
        const postIds = adaptationPostIds.map((a) => a.post_id);
        query = query.in("id", postIds);
      } else {
        return NextResponse.json({ data: [], count: 0 });
      }
    }

    const { data: posts, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: error.message, code: "DB_ERROR" },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: posts, count });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
