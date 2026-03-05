"use client";

import * as React from "react";
import useSWR from "swr";

import { apiFetch } from "@/lib/api/fetcher";
import type { Organization, OrgRole } from "@/types/organization";

export type OrgSummary = Organization & {
  role: OrgRole;
  joined_at: string;
};

type OrgContextValue = {
  orgs: OrgSummary[];
  activeOrg: OrgSummary | null;
  setActiveOrgId: (orgId: string) => void;
  isLoading: boolean;
  error: string | null;
};

const OrgContext = React.createContext<OrgContextValue | null>(null);

const ACTIVE_ORG_STORAGE_KEY = "sns_auto_post.active_org_id";

function getStoredOrgId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredOrgId(orgId: string) {
  try {
    window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, orgId);
  } catch {
    // ignore
  }

  // Also mirror to cookie so server actions/SSR can read if needed.
  document.cookie = `sns_active_org_id=${encodeURIComponent(orgId)}; path=/; SameSite=Lax`;
}

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { data, error, isLoading } = useSWR<{ data: OrgSummary[] }>(
    "/api/orgs",
    (url: string) => apiFetch<{ data: OrgSummary[] }>(url),
  );

  const orgs = React.useMemo(() => data?.data ?? [], [data]);
  const [activeOrgId, setActiveOrgIdState] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    const stored = getStoredOrgId();
    if (stored) setActiveOrgIdState(stored);
  }, []);

  React.useEffect(() => {
    if (!activeOrgId && orgs.length > 0) {
      const nextId = orgs[0]?.id;
      if (nextId) {
        setActiveOrgIdState(nextId);
        setStoredOrgId(nextId);
      }
    }
  }, [activeOrgId, orgs]);

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? orgs[0] ?? null;

  const setActiveOrgId = React.useCallback((orgId: string) => {
    setActiveOrgIdState(orgId);
    setStoredOrgId(orgId);
  }, []);

  return (
    <OrgContext.Provider
      value={{
        orgs,
        activeOrg,
        setActiveOrgId,
        isLoading,
        error: error instanceof Error ? error.message : null,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

/**
 * Access current organization scope in dashboard UI.
 */
export function useOrg() {
  const ctx = React.useContext(OrgContext);
  if (!ctx) {
    throw new Error("useOrg must be used within OrgProvider");
  }
  return ctx;
}
