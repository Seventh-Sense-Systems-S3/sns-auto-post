"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, PenSquare, Settings, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { OrgProvider } from "@/components/tenant/org-context";
import { WorkspaceSwitcher } from "@/components/tenant/WorkspaceSwitcher";

const navItems = [
  { href: "/posts", label: "Posts", icon: PenSquare },
  { href: "/generate", label: "AI Studio", icon: Sparkles },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings/organization", label: "Settings", icon: Settings },
] as const;

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <OrgProvider>
      <div className="min-h-screen bg-zinc-50">
        <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <Link href="/posts" className="text-sm font-semibold">
                SNS Auto-Post
              </Link>
              <div className="hidden sm:block">
                <WorkspaceSwitcher />
              </div>
            </div>
            <div className="sm:hidden">
              <WorkspaceSwitcher />
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[220px_1fr]">
          <SidebarNav />
          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </OrgProvider>
  );
}

function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-row gap-2 overflow-auto md:flex-col md:gap-1">
      {navItems.map((item) => {
        const active =
          pathname === item.href || pathname?.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-700 hover:bg-white hover:text-zinc-900",
              active && "bg-white font-medium text-zinc-900 shadow-sm",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
