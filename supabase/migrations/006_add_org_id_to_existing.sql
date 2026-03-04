-- ============================================================
-- SNS Auto-Post: Add org_id to existing tables
-- ============================================================

-- Add org_id to existing tables that need org-level isolation
ALTER TABLE public.sns_platform_connections ADD COLUMN org_id uuid REFERENCES public.sns_organizations(id);
ALTER TABLE public.sns_posts ADD COLUMN org_id uuid REFERENCES public.sns_organizations(id);
ALTER TABLE public.sns_rate_limits ADD COLUMN org_id uuid REFERENCES public.sns_organizations(id);

-- Indexes for org_id
CREATE INDEX idx_platform_connections_org_id ON public.sns_platform_connections(org_id);
CREATE INDEX idx_posts_org_id ON public.sns_posts(org_id);
CREATE INDEX idx_rate_limits_org_id ON public.sns_rate_limits(org_id);
