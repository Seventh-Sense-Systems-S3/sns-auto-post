-- ============================================================
-- SNS Auto-Post: Update RLS for org-based access
-- ============================================================

-- sns_posts: replace user-based with org-based policy
DROP POLICY IF EXISTS "sns_posts_own" ON public.sns_posts;
CREATE POLICY "org_members_can_crud_posts" ON public.sns_posts
  FOR ALL USING (
    org_id IN (SELECT org_id FROM public.sns_org_members WHERE user_id = auth.uid())
  );

-- sns_platform_connections
DROP POLICY IF EXISTS "sns_connections_own" ON public.sns_platform_connections;
CREATE POLICY "org_members_can_crud_connections" ON public.sns_platform_connections
  FOR ALL USING (
    org_id IN (SELECT org_id FROM public.sns_org_members WHERE user_id = auth.uid())
  );

-- sns_rate_limits
DROP POLICY IF EXISTS "sns_rate_limits_own" ON public.sns_rate_limits;
CREATE POLICY "org_members_can_view_rate_limits" ON public.sns_rate_limits
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.sns_org_members WHERE user_id = auth.uid())
  );
