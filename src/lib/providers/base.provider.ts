import type {
  PlatformType,
  OAuthToken,
  PublishResult,
  PostContent,
} from "@/types/platform";

export abstract class SocialMediaProvider {
  abstract readonly platform: PlatformType;

  abstract getAuthUrl(userId: string, redirectUri: string): Promise<string>;
  abstract handleCallback(
    code: string,
    redirectUri: string,
  ): Promise<OAuthToken>;
  abstract refreshToken(token: OAuthToken): Promise<OAuthToken>;
  abstract publishPost(
    token: OAuthToken,
    content: PostContent,
  ): Promise<PublishResult>;
  abstract validateToken(token: OAuthToken): Promise<boolean>;

  abstract getRateLimitInfo(): { type: string; limit: number; window: string };
}
