export type PlatformType =
  | "x"
  | "instagram"
  | "tiktok"
  | "youtube"
  | "linkedin";

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  accessSecret?: string; // X OAuth 1.0a
}

export interface PlatformConnection {
  id: string;
  userId: string;
  platform: PlatformType;
  token: OAuthToken;
  platformUserId: string;
  platformUsername: string;
  status: "active" | "expired" | "revoked";
}

export interface PublishResult {
  success: boolean;
  platformPostId?: string;
  platformUrl?: string;
  error?: string;
}

export interface PostContent {
  text: string;
  mediaUrls?: string[];
  hashtags?: string[];
  scheduledAt?: Date;
}
