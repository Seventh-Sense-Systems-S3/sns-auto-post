"use client";

import * as React from "react";
import { ChevronsUpDown, Plus } from "lucide-react";

import { useOrg } from "./org-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("");
}

export function WorkspaceSwitcher() {
  const { orgs, activeOrg, setActiveOrgId, isLoading } = useOrg();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-10 justify-between gap-3 px-3"
          disabled={isLoading}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Avatar className="h-7 w-7">
              <AvatarImage
                src={activeOrg?.logo_url ?? undefined}
                alt={activeOrg?.name ?? "Organization"}
              />
              <AvatarFallback>
                {activeOrg?.name ? initials(activeOrg.name) : "—"}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 text-left">
              <span className="block truncate text-sm font-medium">
                {activeOrg?.name ?? "No workspace"}
              </span>
              {activeOrg?.role ? (
                <span className="block truncate text-xs text-zinc-500">
                  {activeOrg.role}
                </span>
              ) : null}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 text-zinc-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {orgs.length === 0 ? (
          <DropdownMenuItem disabled>No organizations found</DropdownMenuItem>
        ) : (
          orgs.map((org) => (
            <DropdownMenuItem
              key={org.id}
              onSelect={() => setActiveOrgId(org.id)}
              className="flex items-center gap-2"
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={org.logo_url ?? undefined} alt={org.name} />
                <AvatarFallback>{initials(org.name)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate">{org.name}</span>
              <Badge variant="secondary" className="capitalize">
                {org.role}
              </Badge>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            window.location.href = "/settings/organization";
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Manage workspaces
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
