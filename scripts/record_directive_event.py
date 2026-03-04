#!/usr/bin/env python3
"""
Inter-Agent Bus: Directive execution event recorder for sns-auto-post

Adapted from 7thSense-Monorepo/scripts/record_directive_event.py.
Records directive claim/completion to Supabase.

Usage:
  # Claim a directive
  python3 scripts/record_directive_event.py claim <directive_path> [--title "Title"]

  # Update to in_progress
  python3 scripts/record_directive_event.py start <directive_path>

  # Mark as completed
  python3 scripts/record_directive_event.py complete <directive_path> \
    [--pr 42] [--files "file1.py,file2.ts"] [--summary "Summary"] [--feedback "Feedback"]

  # Mark as failed
  python3 scripts/record_directive_event.py fail <directive_path> [--feedback "Error details"]

  # Check claim status (other session already claimed?)
  python3 scripts/record_directive_event.py check <directive_path>
  # Exit code: 0 = available, 1 = already claimed
"""

import argparse
import json
import os
import socket
import sys
from datetime import datetime, timezone
from pathlib import Path

project_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project_root))


def _parse_direnv_cache():
    """Parse .direnv/cache/1password_env_exports.sh for env vars (last resort fallback)"""
    cache_path = project_root / ".direnv" / "cache" / "1password_env_exports.sh"
    if not cache_path.exists():
        return {}
    env = {}
    for line in cache_path.read_text().splitlines():
        line = line.strip()
        if line.startswith("export "):
            line = line[7:]
        if "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = v.strip("'\"")
        if k and v:
            env[k] = v
    return env


def get_supabase_client():
    """Supabase client -- env var first + 2-tier fallback"""
    from supabase import create_client

    # 1. Direct env vars (GHA, direnv)
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if url and key:
        return create_client(url, key)

    # 2. .direnv/cache fallback (for worktree / local dev)
    try:
        cached = _parse_direnv_cache()
        url = cached.get("SUPABASE_URL") or cached.get("NEXT_PUBLIC_SUPABASE_URL")
        key = cached.get("SUPABASE_SERVICE_ROLE_KEY")
        if url and key:
            print("Using .direnv/cache fallback", file=sys.stderr)
            return create_client(url, key)
    except Exception as e:
        print(f"Warning: direnv cache fallback failed: {e}", file=sys.stderr)

    print("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found")
    print("   Tried: env vars -> .direnv/cache")
    sys.exit(1)


def get_session_id():
    """Generate session identifier (hostname + PID)"""
    return f"{socket.gethostname()}-{os.getpid()}"


def cmd_check(client, directive_path: str) -> int:
    """Check if directive is already claimed by another session"""
    result = client.table("directive_execution_log") \
        .select("id, agent_session_id, status, claimed_at") \
        .eq("directive_path", directive_path) \
        .in_("status", ["claimed", "in_progress"]) \
        .execute()

    if result.data:
        record = result.data[0]
        print(f"Already claimed by {record['agent_session_id']} "
              f"at {record['claimed_at']} (status: {record['status']})")
        return 1
    else:
        print(f"Available: {directive_path}")
        return 0


def cmd_claim(client, directive_path: str, title: str = None):
    """Claim a directive (declare ownership)"""
    if cmd_check(client, directive_path) == 1:
        print("Cannot claim: already taken by another session")
        sys.exit(1)

    client.table("directive_execution_log").insert({
        "directive_path": directive_path,
        "directive_title": title or Path(directive_path).stem,
        "agent_type": "claude_code",
        "agent_session_id": get_session_id(),
        "status": "claimed",
    }).execute()
    print(f"Claimed: {directive_path}")


def cmd_start(client, directive_path: str):
    """Update status to in_progress"""
    now = datetime.now(timezone.utc).isoformat()
    client.table("directive_execution_log") \
        .update({
            "status": "in_progress",
            "started_at": now,
            "updated_at": now,
        }) \
        .eq("directive_path", directive_path) \
        .in_("status", ["claimed"]) \
        .execute()
    print(f"Started: {directive_path}")


def cmd_complete(client, directive_path: str, pr: int = None,
                 files: str = None, summary: str = None, feedback: str = None,
                 phase: str = "infra", tags: str = None):
    """Update status to completed + trigger Supabase notifications"""
    changed_files = [f.strip() for f in files.split(",") if f.strip()] if files else []
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
    now = datetime.now(timezone.utc).isoformat()

    client.table("directive_execution_log") \
        .update({
            "status": "completed",
            "completed_at": now,
            "updated_at": now,
            "pr_number": pr,
            "changed_files": changed_files,
            "summary": summary or "Completed successfully",
            "feedback": feedback,
            "tags": tag_list,
            "metadata": {"phase": phase},
        }) \
        .eq("directive_path", directive_path) \
        .in_("status", ["claimed", "in_progress"]) \
        .execute()
    print(f"Completed: {directive_path}")


def cmd_fail(client, directive_path: str, feedback: str = None):
    """Update status to failed"""
    now = datetime.now(timezone.utc).isoformat()
    client.table("directive_execution_log") \
        .update({
            "status": "failed",
            "completed_at": now,
            "updated_at": now,
            "feedback": feedback or "Failed without details",
        }) \
        .eq("directive_path", directive_path) \
        .in_("status", ["claimed", "in_progress"]) \
        .execute()
    print(f"Failed: {directive_path}")


def main():
    parser = argparse.ArgumentParser(description="Inter-Agent Bus: Directive Event Recorder (sns-auto-post)")
    parser.add_argument("action", choices=["check", "claim", "start", "complete", "fail"])
    parser.add_argument("directive_path", help="Path to directive file in 000_INBOX")
    parser.add_argument("--title", help="Directive title")
    parser.add_argument("--pr", type=int, help="PR number")
    parser.add_argument("--files", help="Comma-separated changed files")
    parser.add_argument("--summary", help="Execution summary")
    parser.add_argument("--feedback", help="Feedback text")
    parser.add_argument("--phase", default="infra", help="Phase domain")
    parser.add_argument("--tags", help="Comma-separated tags")

    args = parser.parse_args()
    client = get_supabase_client()

    if args.action == "check":
        sys.exit(cmd_check(client, args.directive_path))
    elif args.action == "claim":
        cmd_claim(client, args.directive_path, args.title)
    elif args.action == "start":
        cmd_start(client, args.directive_path)
    elif args.action == "complete":
        cmd_complete(client, args.directive_path, args.pr, args.files,
                     args.summary, args.feedback, args.phase, args.tags)
    elif args.action == "fail":
        cmd_fail(client, args.directive_path, args.feedback)


if __name__ == "__main__":
    main()
