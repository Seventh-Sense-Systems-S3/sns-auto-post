-- ============================================================
-- SNS Auto-Post: Row Level Security
-- ============================================================

ALTER TABLE public.sns_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sns_platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sns_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sns_post_adaptations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sns_post_publishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sns_post_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sns_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sns_users_own" ON public.sns_users FOR ALL USING (auth.uid() = id);
CREATE POLICY "sns_posts_own" ON public.sns_posts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "sns_connections_own" ON public.sns_platform_connections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "sns_adaptations_own" ON public.sns_post_adaptations FOR ALL
  USING (post_id IN (SELECT id FROM public.sns_posts WHERE user_id = auth.uid()));
CREATE POLICY "sns_publishes_own" ON public.sns_post_publishes FOR ALL
  USING (post_id IN (SELECT id FROM public.sns_posts WHERE user_id = auth.uid()));
CREATE POLICY "sns_analytics_own" ON public.sns_post_analytics FOR ALL
  USING (publish_id IN (
    SELECT pp.id FROM public.sns_post_publishes pp
    JOIN public.sns_posts p ON pp.post_id = p.id
    WHERE p.user_id = auth.uid()
  ));
CREATE POLICY "sns_rate_limits_own" ON public.sns_rate_limits FOR ALL USING (auth.uid() = user_id);
