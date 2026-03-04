-- ============================================================
-- SNS Auto-Post: Organization Tables (Multi-tenant Foundation)
-- ============================================================

-- Organizations
CREATE TABLE public.sns_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  logo_url text,
  brand_voice_settings jsonb DEFAULT '{}',
  plan text DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Organization Members
CREATE TABLE public.sns_org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.sns_organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.sns_users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  invited_by uuid REFERENCES public.sns_users(id),
  joined_at timestamptz DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- Organization Invitations
CREATE TABLE public.sns_org_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.sns_organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'editor',
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by uuid REFERENCES public.sns_users(id),
  expires_at timestamptz DEFAULT now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.sns_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sns_org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sns_org_invitations ENABLE ROW LEVEL SECURITY;

-- Organizations: メンバーのみ閲覧可
CREATE POLICY "org_members_can_view" ON public.sns_organizations
  FOR SELECT USING (
    id IN (SELECT org_id FROM public.sns_org_members WHERE user_id = auth.uid())
  );

-- Org Members: 同じorgのメンバーが閲覧可
CREATE POLICY "org_members_can_view_members" ON public.sns_org_members
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.sns_org_members WHERE user_id = auth.uid())
  );

-- Owner/Adminのみメンバー追加・削除可
CREATE POLICY "org_admin_can_manage_members" ON public.sns_org_members
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM public.sns_org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Invitations: Owner/Adminのみ管理可
CREATE POLICY "org_admin_can_manage_invitations" ON public.sns_org_invitations
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM public.sns_org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Indexes
CREATE INDEX idx_org_members_org_id ON public.sns_org_members(org_id);
CREATE INDEX idx_org_members_user_id ON public.sns_org_members(user_id);
CREATE INDEX idx_org_invitations_token ON public.sns_org_invitations(token);
CREATE INDEX idx_org_invitations_email ON public.sns_org_invitations(email);
