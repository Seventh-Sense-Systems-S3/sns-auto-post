import { TwitterApi } from "twitter-api-v2";
import { SocialMediaProvider } from "@/lib/providers/base.provider";
import type {
  PlatformType,
  OAuthToken,
  PublishResult,
  PostContent,
} from "@/types/platform";

function getAppKeys() {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("X_API_KEY and X_API_SECRET must be set in environment.");
  }
  return { apiKey, apiSecret };
}

export class XProvider extends SocialMediaProvider {
  readonly platform: PlatformType = "x";

  /**
   * Generate an OAuth 1.0a request token and return the authorization URL.
   * The returned URL string also encodes the oauthTokenSecret in the hash
   * so the caller can persist it (e.g. in a cookie).
   *
   * Returns: `authUrl\noauthToken\noauthTokenSecret` — caller splits on '\n'.
   */
  async getAuthUrl(_userId: string, redirectUri: string): Promise<string> {
    const { apiKey, apiSecret } = getAppKeys();
    const client = new TwitterApi({ appKey: apiKey, appSecret: apiSecret });

    const { url, oauth_token, oauth_token_secret } =
      await client.generateAuthLink(redirectUri, { linkMode: "authorize" });

    // Pack URL + token + secret so the route handler can store the secret
    return [url, oauth_token, oauth_token_secret].join("\n");
  }

  /**
   * Exchange the oauth_verifier for a permanent access token.
   * `code` is `oauthToken:oauthTokenSecret:oauthVerifier` joined by ':'.
   * `redirectUri` is unused for OAuth 1.0a exchange but kept for interface compat.
   */
  async handleCallback(
    code: string,
    _redirectUri: string,
  ): Promise<OAuthToken> {
    const [oauthToken, oauthTokenSecret, oauthVerifier] = code.split(":");
    if (!oauthToken || !oauthTokenSecret || !oauthVerifier) {
      throw new Error(
        "Invalid callback code. Expected 'oauthToken:oauthTokenSecret:oauthVerifier'.",
      );
    }

    const { apiKey, apiSecret } = getAppKeys();
    const tempClient = new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
      accessToken: oauthToken,
      accessSecret: oauthTokenSecret,
    });

    const { accessToken, accessSecret } = await tempClient.login(oauthVerifier);

    return {
      accessToken,
      accessSecret,
    };
  }

  /**
   * OAuth 1.0a tokens do not expire / cannot be refreshed.
   * Return the same token unchanged.
   */
  async refreshToken(token: OAuthToken): Promise<OAuthToken> {
    return token;
  }

  async publishPost(
    token: OAuthToken,
    content: PostContent,
  ): Promise<PublishResult> {
    try {
      const { apiKey, apiSecret } = getAppKeys();
      const client = new TwitterApi({
        appKey: apiKey,
        appSecret: apiSecret,
        accessToken: token.accessToken,
        accessSecret: token.accessSecret,
      });

      const text = content.hashtags?.length
        ? `${content.text}\n\n${content.hashtags.map((t) => `#${t}`).join(" ")}`
        : content.text;

      const { data } = await client.v2.tweet(text);

      return {
        success: true,
        platformPostId: data.id,
        platformUrl: `https://x.com/i/status/${data.id}`,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async validateToken(token: OAuthToken): Promise<boolean> {
    try {
      const { apiKey, apiSecret } = getAppKeys();
      const client = new TwitterApi({
        appKey: apiKey,
        appSecret: apiSecret,
        accessToken: token.accessToken,
        accessSecret: token.accessSecret,
      });

      await client.v2.me();
      return true;
    } catch {
      return false;
    }
  }

  getRateLimitInfo() {
    return { type: "monthly", limit: 500, window: "30d" };
  }
}
