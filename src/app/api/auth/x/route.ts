import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { XProvider } from "@/lib/providers/x.provider";

export async function GET() {
  try {
    const provider = new XProvider();

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl) {
      return NextResponse.json(
        {
          error: "NEXT_PUBLIC_APP_URL is not configured",
          code: "CONFIG_ERROR",
        },
        { status: 500 },
      );
    }

    const redirectUri = `${baseUrl}/api/auth/x/callback`;

    // getAuthUrl returns "authUrl\noauthToken\noauthTokenSecret"
    const packed = await provider.getAuthUrl("", redirectUri);
    const [authUrl, , oauthTokenSecret] = packed.split("\n");

    // Store the oauth_token_secret in an httpOnly cookie for the callback
    const cookieStore = await cookies();
    cookieStore.set("x_oauth_token_secret", oauthTokenSecret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });

    return NextResponse.redirect(authUrl);
  } catch (err) {
    console.error("[X OAuth Start]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to start X OAuth",
        code: "OAUTH_START_ERROR",
      },
      { status: 500 },
    );
  }
}
