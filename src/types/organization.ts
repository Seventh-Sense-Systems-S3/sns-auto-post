import { z } from "zod/v4";

export type OrgRole = "owner" | "admin" | "editor" | "viewer";
export type OrgPlan = "free" | "starter" | "pro" | "enterprise";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_voice_settings: Record<string, unknown>;
  plan: OrgPlan;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgRole;
  invited_by: string | null;
  joined_at: string;
}

export interface OrgInvitation {
  id: string;
  org_id: string;
  email: string;
  role: OrgRole;
  token: string;
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export const CreateOrgSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
});

export const UpdateOrgSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  logo_url: z.string().url().optional(),
  brand_voice_settings: z.record(z.string(), z.unknown()).optional(),
});

export const InviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "editor", "viewer"]),
});
