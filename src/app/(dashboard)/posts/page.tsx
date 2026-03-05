"use client";

import * as React from "react";
import useSWR from "swr";

import { useOrg } from "@/components/tenant/org-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api/fetcher";
import type { Post } from "@/types/post";

type PostsResponse = { data: Post[]; count: number };

export default function PostsPage() {
  const { activeOrg } = useOrg();
  const orgId = activeOrg?.id;

  const [status, setStatus] = React.useState<string>("all");

  const qs = new URLSearchParams();
  if (status !== "all") qs.set("status", status);
  if (orgId) qs.set("org_id", orgId);
  qs.set("limit", "50");

  const { data, error, isLoading } = useSWR<PostsResponse>(
    orgId ? `/api/posts?${qs.toString()}` : null,
    (url: string) => apiFetch<PostsResponse>(url, { orgId }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Posts</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Drafts, approvals, and publishing status per workspace.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recent</CardTitle>
          <select
            className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="pending_approval">Pending approval</option>
            <option value="approved">Approved</option>
            <option value="scheduled">Scheduled</option>
            <option value="publishing">Publishing</option>
            <option value="published">Published</option>
            <option value="failed">Failed</option>
          </select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-zinc-500">Loading…</div>
          ) : error ? (
            <div className="text-sm text-red-600">{error.message}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.data ?? []).map((post) => (
                  <TableRow key={post.id}>
                    <TableCell>
                      <Badge variant={statusToBadge(post.status)}>
                        {post.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[520px] truncate">
                      {post.title ?? post.content_original.slice(0, 80)}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {new Date(post.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {(data?.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-sm text-zinc-500">
                      No posts found.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function statusToBadge(status: string) {
  if (status === "published" || status === "approved")
    return "success" as const;
  if (status === "failed") return "destructive" as const;
  if (status === "pending_approval") return "warning" as const;
  return "default" as const;
}
