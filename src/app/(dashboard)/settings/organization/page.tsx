"use client";

import * as React from "react";
import useSWR, { mutate } from "swr";

import { useOrg } from "@/components/tenant/org-context";
import { apiFetch, apiPost } from "@/lib/api/fetcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Organization, OrgRole } from "@/types/organization";
import type { BrandVoiceSettings } from "@/types/ai";

type MemberRow = {
  id: string;
  role: OrgRole;
  joined_at: string;
  invited_by: string | null;
  user: {
    id: string;
    email: string;
    name: string | null;
    avatar_url: string | null;
  };
};

type UsageResponse = {
  plan: string;
  limits: {
    members: number;
    postsPerMonth: number;
    generationsPerMonth: number;
  };
  usage: {
    members: number;
    postsThisMonth: number;
    publishesThisMonth: number;
  };
};

export default function OrganizationSettingsPage() {
  const { activeOrg } = useOrg();
  const orgId = activeOrg?.id;

  const { data: org, error: orgError } = useSWR<Organization>(
    orgId ? `/api/orgs/${orgId}` : null,
    (url: string) => apiFetch<Organization>(url),
  );

  const { data: membersResp } = useSWR<{ data: MemberRow[] }>(
    orgId ? `/api/orgs/${orgId}/members` : null,
    (url: string) => apiFetch<{ data: MemberRow[] }>(url),
  );

  const { data: usage } = useSWR<UsageResponse>(
    orgId ? `/api/orgs/${orgId}/usage` : null,
    (url: string) => apiFetch<UsageResponse>(url),
  );

  const { data: brandVoiceResp } = useSWR<{
    brand_voice: Partial<BrandVoiceSettings>;
  }>(orgId ? `/api/orgs/${orgId}/brand-voice` : null, (url: string) =>
    apiFetch<{ brand_voice: Partial<BrandVoiceSettings> }>(url),
  );

  const members = membersResp?.data ?? [];
  const canManage =
    (activeOrg?.role ?? "viewer") === "owner" ||
    (activeOrg?.role ?? "viewer") === "admin";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Organization settings</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage workspace profile, members, usage, and brand voice.
        </p>
      </div>

      {orgError ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {orgError.message}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <OrgProfileCard
          org={org ?? null}
          orgId={orgId ?? null}
          canManage={canManage}
        />
        <PlanUsageCard usage={usage ?? null} />
      </div>

      <MembersCard
        orgId={orgId ?? null}
        members={members}
        canManage={canManage}
      />
      <BrandVoiceCard
        orgId={orgId ?? null}
        canManage={canManage}
        brandVoice={brandVoiceResp?.brand_voice ?? {}}
      />
    </div>
  );
}

function OrgProfileCard({
  org,
  orgId,
  canManage,
}: {
  org: Organization | null;
  orgId: string | null;
  canManage: boolean;
}) {
  const [name, setName] = React.useState("");
  const [logoUrl, setLogoUrl] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    setName(org?.name ?? "");
    setLogoUrl(org?.logo_url ?? "");
  }, [org?.name, org?.logo_url]);

  async function save() {
    if (!orgId) return;
    setSaving(true);
    setErr(null);
    try {
      await apiFetch<Organization>(`/api/orgs/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, logo_url: logoUrl || undefined }),
      });
      await mutate(`/api/orgs/${orgId}`);
      await mutate("/api/orgs");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Workspace profile</CardTitle>
        {canManage ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Edit</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit workspace</DialogTitle>
                <DialogDescription>
                  Owners/admins can update workspace name and logo URL.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="org-name">Name</Label>
                  <Input
                    id="org-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Acme Inc."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="org-logo">Logo URL</Label>
                  <Input
                    id="org-logo"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
                {err ? <div className="text-sm text-red-600">{err}</div> : null}
              </div>
              <DialogFooter>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setErr(null)}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Badge variant="secondary">Read-only</Badge>
        )}
      </CardHeader>
      <CardContent>
        {!org ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : (
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarImage src={org.logo_url ?? undefined} alt={org.name} />
              <AvatarFallback>
                {org.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{org.name}</div>
              <div className="truncate text-sm text-zinc-500">
                slug: <span className="font-mono">{org.slug}</span>
              </div>
              <div className="mt-1">
                <Badge variant="default" className="capitalize">
                  plan: {org.plan}
                </Badge>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PlanUsageCard({ usage }: { usage: UsageResponse | null }) {
  const members = usage?.usage.members ?? 0;
  const posts = usage?.usage.postsThisMonth ?? 0;
  const publishes = usage?.usage.publishesThisMonth ?? 0;

  const memberLimit = usage?.limits.members ?? 0;
  const postsLimit = usage?.limits.postsPerMonth ?? 0;
  const genLimit = usage?.limits.generationsPerMonth ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan & usage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!usage ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">Plan</span>
              <span className="font-medium capitalize">{usage.plan}</span>
            </div>
            <UsageBar label="Members" value={members} limit={memberLimit} />
            <UsageBar
              label="Posts (this month)"
              value={posts}
              limit={postsLimit}
            />
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">Publishes (this month)</span>
              <span className="font-medium">{publishes}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">AI generations (limit)</span>
              <span className="font-medium">{genLimit}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function UsageBar({
  label,
  value,
  limit,
}: {
  label: string;
  value: number;
  limit: number;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((value / limit) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-500">{label}</span>
        <span className="font-medium">
          {value} / {limit}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-zinc-100">
        <div
          className="h-2 rounded-full bg-zinc-900"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function MembersCard({
  orgId,
  members,
  canManage,
}: {
  orgId: string | null;
  members: MemberRow[];
  canManage: boolean;
}) {
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<OrgRole>("editor");
  const [inviting, setInviting] = React.useState(false);
  const [inviteErr, setInviteErr] = React.useState<string | null>(null);

  async function invite() {
    if (!orgId) return;
    setInviting(true);
    setInviteErr(null);
    try {
      await apiPost(`/api/orgs/${orgId}/invite`, {
        email: inviteEmail,
        role: inviteRole === "owner" ? "admin" : inviteRole,
      });
      setInviteEmail("");
      setInviteRole("editor");
    } catch (e) {
      setInviteErr(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setInviting(false);
    }
  }

  async function updateRole(userId: string, role: OrgRole) {
    if (!orgId) return;
    await apiFetch(`/api/orgs/${orgId}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    await mutate(`/api/orgs/${orgId}/members`);
    await mutate("/api/orgs");
  }

  async function removeMember(userId: string) {
    if (!orgId) return;
    await apiFetch(`/api/orgs/${orgId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    await mutate(`/api/orgs/${orgId}/members`);
    await mutate("/api/orgs");
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Members</CardTitle>
        {canManage ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button>Invite</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite member</DialogTitle>
                <DialogDescription>
                  Invite by email, assign a role, and manage access.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input
                    id="invite-email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="member@example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invite-role">Role</Label>
                  <select
                    id="invite-role"
                    className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as OrgRole)}
                  >
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                {inviteErr ? (
                  <div className="text-sm text-red-600">{inviteErr}</div>
                ) : null}
              </div>
              <DialogFooter>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setInviteErr(null)}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={invite} disabled={inviting}>
                  {inviting ? "Inviting…" : "Send invite"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Badge variant="secondary">Read-only</Badge>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage
                        src={m.user.avatar_url ?? undefined}
                        alt={m.user.email}
                      />
                      <AvatarFallback>
                        {m.user.email.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {m.user.name || m.user.email}
                      </div>
                      <div className="truncate text-xs text-zinc-500">
                        {m.user.email}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {canManage ? (
                    <select
                      className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm capitalize"
                      value={m.role}
                      onChange={(e) =>
                        updateRole(m.user.id, e.target.value as OrgRole)
                      }
                      disabled={m.role === "owner" && !canManage}
                    >
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  ) : (
                    <Badge variant="secondary" className="capitalize">
                      {m.role}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-zinc-500">
                  {new Date(m.joined_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  {canManage ? (
                    <Button
                      variant="ghost"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => removeMember(m.user.id)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-sm text-zinc-500">
                  No members found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function BrandVoiceCard({
  orgId,
  canManage,
  brandVoice,
}: {
  orgId: string | null;
  canManage: boolean;
  brandVoice: Partial<BrandVoiceSettings>;
}) {
  const [tone, setTone] = React.useState(brandVoice.tone ?? "professional");
  const [keywords, setKeywords] = React.useState(
    (brandVoice.keywords ?? []).join(", "),
  );
  const [avoid, setAvoid] = React.useState(
    (brandVoice.avoid_words ?? []).join(", "),
  );
  const [personality, setPersonality] = React.useState(
    brandVoice.personality ?? "",
  );
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    setTone(brandVoice.tone ?? "professional");
    setKeywords((brandVoice.keywords ?? []).join(", "));
    setAvoid((brandVoice.avoid_words ?? []).join(", "));
    setPersonality(brandVoice.personality ?? "");
  }, [brandVoice]);

  async function save() {
    if (!orgId) return;
    setSaving(true);
    setErr(null);
    try {
      await apiFetch(`/api/orgs/${orgId}/brand-voice`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tone,
          keywords: splitCsv(keywords),
          avoid_words: splitCsv(avoid),
          personality,
        }),
      });
      await mutate(`/api/orgs/${orgId}/brand-voice`);
      await mutate(`/api/orgs/${orgId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Brand voice</CardTitle>
        {canManage ? (
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        ) : (
          <Badge variant="secondary">Read-only</Badge>
        )}
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="bv-tone">Tone</Label>
          <select
            id="bv-tone"
            className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
            value={tone}
            onChange={(e) =>
              setTone(e.target.value as BrandVoiceSettings["tone"])
            }
            disabled={!canManage}
          >
            <option value="formal">formal</option>
            <option value="casual">casual</option>
            <option value="professional">professional</option>
            <option value="friendly">friendly</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bv-personality">Personality</Label>
          <Input
            id="bv-personality"
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
            placeholder="e.g. calm, direct, helpful"
            disabled={!canManage}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bv-keywords">Keywords (comma separated)</Label>
          <Input
            id="bv-keywords"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            disabled={!canManage}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bv-avoid">Avoid words (comma separated)</Label>
          <Input
            id="bv-avoid"
            value={avoid}
            onChange={(e) => setAvoid(e.target.value)}
            disabled={!canManage}
          />
        </div>
        {err ? (
          <div className="md:col-span-2 text-sm text-red-600">{err}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function splitCsv(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
