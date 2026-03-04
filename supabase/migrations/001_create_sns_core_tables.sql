-- ============================================================
-- SNS Auto-Post: Core Tables (namespace: sns_)
-- ============================================================

-- sns_users
CREATE TABLE public.sns_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- sns_platform_connections (OAuth tokens)
CREATE TABLE public.sns_platform_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.sns_users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('x', 'instagram', 'tiktok', 'youtube', 'linkedin')),
  encrypted_token TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  platform_user_id TEXT NOT NULL,
  platform_username TEXT,
  scope TEXT[],
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, platform)
);

-- sns_posts
CREATE TABLE public.sns_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.sns_users(id) ON DELETE CASCADE,
  title TEXT,
  content_original TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'scheduled', 'publishing', 'published', 'failed')),
  scheduled_at TIMESTAMPTZ,
  tags TEXT[],
  media_urls TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ
);

-- sns_post_adaptations
CREATE TABLE public.sns_post_adaptations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.sns_posts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('x', 'instagram', 'tiktok', 'youtube', 'linkedin')),
  content_adapted TEXT NOT NULL,
  media_ids TEXT[],
  constraints_applied JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, platform)
);

-- sns_post_publishes
CREATE TABLE public.sns_post_publishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.sns_posts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'publishing', 'published', 'failed')),
  platform_post_id TEXT,
  platform_url TEXT,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, platform)
);

-- sns_post_analytics
CREATE TABLE public.sns_post_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publish_id UUID NOT NULL REFERENCES public.sns_post_publishes(id) ON DELETE CASCADE,
  impressions INT DEFAULT 0,
  clicks INT DEFAULT 0,
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  shares INT DEFAULT 0,
  saves INT DEFAULT 0,
  video_views INT DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT now()
);

-- sns_rate_limits
CREATE TABLE public.sns_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.sns_users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  limit_type TEXT NOT NULL CHECK (limit_type IN ('hourly', 'daily', 'monthly')),
  current_usage INT DEFAULT 0,
  max_limit INT NOT NULL,
  window_reset_at TIMESTAMPTZ,
  UNIQUE(user_id, platform, limit_type)
);
