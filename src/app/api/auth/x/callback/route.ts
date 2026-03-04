import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { XProvider } from "@/lib/providers/x.provider";
import { encrypt } from "@/utils/token-encryption";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TwitterApi } from "twitter-api-v2";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const oauthToken = searchParams.get("oauth_token");
    const oauthVerifier = searchParams.get("oauth_verifier");

    if (!oauthToken || !oauthVerifier) {
      return NextResponse.json(
        {
          error: "Missing oauth_token or oauth_verifier",
          code: "INVALID_CALLBACK",
        },
        { status: 400 },
      );
    }

    // Retrieve the stored oauth_token_secret
    const cookieStore = await cookies();
    const oauthTokenSecret = cookieStore.get("x_oauth_token_secret")?.value;

    if (!oauthTokenSecret) {
      return NextResponse.json(
        {
          error: "OAuth session expired. Please try again.",
          code: "SESSION_EXPIRED",
        },
        { status: 400 },
      );
    }

    // Exchange for access token
    const provider = new XProvider();
    const callbackCode = [oauthToken, oauthTokenSecret, oauthVerifier].join(
      ":",
    );
    const token = await provider.handleCallback(callbackCode, "");

    // Fetch X user profile to get userId and username
    const apiKey = process.env.X_API_KEY!;
    const apiSecret = process.env.X_API_SECRET!;
    const userClient = new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
      accessToken: token.accessToken,
      accessSecret: token.accessSecret,
    });
    const { data: xUser } = await userClient.v2.me();

    // Encrypt tokens before storage
    const encryptedAccessToken = encrypt(token.accessToken);
    const encryptedAccessSecret = encrypt(token.accessSecret ?? "");

    // Get authenticated Supabase user
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated", code: "AUTH_REQUIRED" },
        { status: 401 },
      );
    }

    // Upsert the platform connection
    const { error: dbError } = await supabase
      .from("sns_platform_connections")
      .upsert(
        {
          user_id: user.id,
          platform: "x",
          encrypted_access_token: encryptedAccessToken,
          encrypted_access_secret: encryptedAccessSecret,
          platform_user_id: xUser.id,
          platform_username: xUser.username,
          status: "active",
          connected_at: new Date().toISOString(),
        },
        { onConflict: "user_id,platform" },
      );

    if (dbError) {
      console.error("[X OAuth Callback] DB error:", dbError);
      return NextResponse.json(
        { error: "Failed to save connection", code: "DB_ERROR" },
        { status: 500 },
      );
    }

    // Clean up the temporary cookie
    cookieStore.delete("x_oauth_token_secret");

    // Redirect to settings with success
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    return NextResponse.redirect(`${baseUrl}/dashboard/settings?connected=x`);
  } catch (err) {
    console.error("[X OAuth Callback]", err);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    return NextResponse.redirect(
      `${baseUrl}/dashboard/settings?error=x_oauth_failed`,
    );
  }
}
