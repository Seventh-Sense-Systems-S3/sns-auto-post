-- ============================================================
-- SNS Auto-Post: Performance Indexes
-- ============================================================

CREATE INDEX idx_sns_posts_user_status ON public.sns_posts(user_id, status);
CREATE INDEX idx_sns_posts_scheduled ON public.sns_posts(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_sns_publishes_status ON public.sns_post_publishes(status) WHERE status IN ('pending', 'publishing');
CREATE INDEX idx_sns_rate_limits_reset ON public.sns_rate_limits(window_reset_at);
