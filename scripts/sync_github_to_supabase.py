#!/usr/bin/env python3
"""
GitHub -> Supabase sync script for sns-auto-post

Adapted from 7thSense-Monorepo/scripts/sync_github_to_supabase.py.
Changes:
  - Default repo: sns-auto-post
  - Added --repo CLI argument
  - Removed load_env_from_1password fallback (env vars only in GHA context)
  - Uses httpx instead of requests
"""

import os
import sys
import json
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple

# Project root
project_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project_root))

try:
    from supabase import create_client, Client
except ImportError:
    print("supabase-py is not installed")
    print("pip install supabase")
    sys.exit(1)


def get_supabase_client() -> Client:
    """Create Supabase client from environment variables"""
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

    return create_client(supabase_url, supabase_key)


def sync_epic(epic_data: Dict[str, Any], supabase: Client) -> bool:
    """Sync Epic to Supabase"""
    try:
        existing = supabase.table("epic_history")\
            .select("id")\
            .eq("github_epic_number", epic_data["github_epic_number"])\
            .execute()

        if existing.data:
            supabase.table("epic_history")\
                .update(epic_data)\
                .eq("github_epic_number", epic_data["github_epic_number"])\
                .execute()
            print(f"Epic #{epic_data['github_epic_number']} updated")
        else:
            supabase.table("epic_history")\
                .insert(epic_data)\
                .execute()
            print(f"Epic #{epic_data['github_epic_number']} created")

        return True
    except Exception as e:
        print(f"Failed to sync epic: {e}")
        return False


def sync_issue(issue_data: Dict[str, Any], supabase: Client) -> bool:
    """Sync Issue to Supabase"""
    try:
        existing = supabase.table("issue_history")\
            .select("id")\
            .eq("github_issue_number", issue_data["github_issue_number"])\
            .execute()

        if existing.data:
            supabase.table("issue_history")\
                .update(issue_data)\
                .eq("github_issue_number", issue_data["github_issue_number"])\
                .execute()
            print(f"Issue #{issue_data['github_issue_number']} updated")
        else:
            supabase.table("issue_history")\
                .insert(issue_data)\
                .execute()
            print(f"Issue #{issue_data['github_issue_number']} created")

        return True
    except Exception as e:
        print(f"Failed to sync issue: {e}")
        return False


def sync_dependency(source_type: str, source_id: int, target_type: str, target_id: int,
                   dependency_type: str, supabase: Client) -> bool:
    """Sync dependency to Supabase"""
    try:
        dep_data = {
            "source_type": source_type,
            "source_id": source_id,
            "target_type": target_type,
            "target_id": target_id,
            "dependency_type": dependency_type,
            "ai_detected": True,
            "confidence_score": 0.8
        }

        existing = supabase.table("dependency_graph")\
            .select("id")\
            .eq("source_type", source_type)\
            .eq("source_id", source_id)\
            .eq("target_type", target_type)\
            .eq("target_id", target_id)\
            .eq("dependency_type", dependency_type)\
            .execute()

        if existing.data:
            supabase.table("dependency_graph")\
                .update(dep_data)\
                .eq("id", existing.data[0]["id"])\
                .execute()
            print(f"Dependency updated: {source_type}#{source_id} -> {target_type}#{target_id}")
        else:
            supabase.table("dependency_graph")\
                .insert(dep_data)\
                .execute()
            print(f"Dependency created: {source_type}#{source_id} -> {target_type}#{target_id}")

        return True
    except Exception as e:
        print(f"Failed to sync dependency: {e}")
        return False


def sync_pr(pr_data: Dict[str, Any], supabase: Client) -> bool:
    """Sync PR to Supabase"""
    try:
        existing = supabase.table("github_pr_history")\
            .select("id")\
            .eq("github_pr_number", pr_data["github_pr_number"])\
            .execute()

        if existing.data:
            supabase.table("github_pr_history")\
                .update(pr_data)\
                .eq("github_pr_number", pr_data["github_pr_number"])\
                .execute()
        else:
            supabase.table("github_pr_history")\
                .insert(pr_data)\
                .execute()

        return True
    except Exception as e:
        print(f"Failed to sync PR: {e}")
        return False


def sync_all_prs(supabase: Client, repo_name: str) -> None:
    """Sync all PRs"""
    import subprocess

    print("Fetching all PRs from GitHub API...")
    result = subprocess.run(
        ["gh", "pr", "list", "--repo", repo_name, "--state", "all", "--limit", "500",
         "--json", "number,title,body,state,baseRefName,headRefName,labels,reviewDecision,mergedAt,createdAt,updatedAt,url"],
        capture_output=True, text=True
    )

    if result.returncode != 0:
        print(f"gh pr list error: {result.stderr}")
        return

    prs = json.loads(result.stdout)
    print(f"Fetched {len(prs)} PRs")

    synced = 0
    errors = 0
    for pr in prs:
        pr_state = pr.get("state", "OPEN").lower()
        if pr.get("mergedAt"):
            pr_state = "merged"
        elif pr_state == "closed":
            pr_state = "closed"
        else:
            pr_state = "open"

        pr_data = {
            "github_pr_number": pr["number"],
            "github_url": pr.get("url", ""),
            "title": pr["title"],
            "body": pr.get("body", ""),
            "state": pr_state,
            "base_branch": pr.get("baseRefName", ""),
            "head_branch": pr.get("headRefName", ""),
            "labels": json.dumps([l.get("name", "") for l in pr.get("labels", [])]),
            "review_state": pr.get("reviewDecision", "").lower() or None,
            "merged_at": pr.get("mergedAt"),
        }

        if sync_pr(pr_data, supabase):
            synced += 1
        else:
            errors += 1

    print(f"PR sync complete: {synced} synced / {errors} errors")


def sync_branches(supabase: Client, repo_name: str) -> None:
    """Sync branch information"""
    import subprocess

    print("Fetching branches...")
    result = subprocess.run(
        ["gh", "api", f"repos/{repo_name}/branches", "--paginate", "-q", ".[].name"],
        capture_output=True, text=True
    )

    if result.returncode != 0:
        print(f"gh api error: {result.stderr}")
        return

    branch_names = [b.strip() for b in result.stdout.strip().split("\n") if b.strip()]
    print(f"Fetched {len(branch_names)} branches")

    synced = 0
    for name in branch_names:
        category = "other"
        if name.startswith("feature/"):
            category = "feature"
        elif name.startswith("chore/"):
            category = "chore"
        elif name.startswith("dependabot/"):
            category = "dependabot"
        elif name.startswith("fix/"):
            category = "feature"

        branch_data = {
            "branch_name": name,
            "is_merged": name == "main",
            "category": category,
        }

        try:
            existing = supabase.table("github_branch_summary")\
                .select("id")\
                .eq("branch_name", name)\
                .execute()

            if existing.data:
                supabase.table("github_branch_summary")\
                    .update(branch_data)\
                    .eq("branch_name", name)\
                    .execute()
            else:
                supabase.table("github_branch_summary")\
                    .insert(branch_data)\
                    .execute()
            synced += 1
        except Exception as e:
            print(f"Failed to sync branch {name}: {e}")

    print(f"Branch sync complete: {synced} branches")


def get_issue_labels_from_event():
    """Get labels from GITHUB_EVENT_PATH"""
    event_path = os.getenv("GITHUB_EVENT_PATH")
    if not event_path:
        return "[]"

    try:
        with open(event_path, 'r', encoding='utf-8') as f:
            event_data = json.load(f)
            issue_data = event_data.get('issue') or event_data.get('pull_request')
            if issue_data and 'labels' in issue_data:
                return json.dumps(issue_data['labels'])
    except Exception as e:
        print(f"Warning: event file read error: {e}")

    return "[]"


def sync_all_issues(supabase: Client, repo_name: str, batch_size: int = 100, max_workers: int = 10) -> None:
    """
    Sync all Issues/PRs (for workflow_dispatch / schedule).

    Uses httpx for HTTP requests and ThreadPoolExecutor for parallel processing.

    Args:
        supabase: Supabase client
        repo_name: Repository name (owner/repo)
        batch_size: Batch size (default: 100)
        max_workers: Number of parallel workers (default: 10)
    """
    import httpx
    from concurrent.futures import ThreadPoolExecutor, as_completed
    from datetime import datetime

    github_token = os.getenv("GITHUB_TOKEN")
    if not github_token:
        print("GITHUB_TOKEN is not set")
        return

    owner, repo = repo_name.split("/")
    headers = {
        "Authorization": f"token {github_token}",
        "Accept": "application/vnd.github.v3+json"
    }

    print("Starting full Issue/PR sync (batch mode)")
    print(f"Repository: {repo_name}")
    print(f"Batch size: {batch_size}")
    print(f"Workers: {max_workers}")
    print()

    # Fetch all issues
    all_issues = []
    page = 1
    per_page = 100

    print("Fetching all Issues/PRs from GitHub API...")
    while True:
        url = f"https://api.github.com/repos/{owner}/{repo}/issues"
        params = {
            "state": "all",
            "per_page": per_page,
            "page": page
        }

        response = httpx.get(url, headers=headers, params=params)
        if response.status_code != 200:
            print(f"GitHub API error: {response.status_code}")
            break

        issues = response.json()
        if not issues:
            break

        all_issues.extend(issues)
        print(f"   Fetching: {len(all_issues)} items...", end="\r")

        if len(issues) < per_page:
            break
        page += 1

    print(f"\nFetched {len(all_issues)} Issues/PRs")
    print()

    issues_only = all_issues
    print(f"Total items: {len(issues_only)}")
    print()

    # Batch sync
    total_synced = 0
    total_errors = 0

    def sync_single_issue(issue: Dict[str, Any]) -> Tuple[bool, str]:
        """Sync a single Issue/Epic"""
        try:
            issue_labels = issue.get("labels", [])
            is_epic = any(label.get("name", "").startswith("type:epic") for label in issue_labels)

            if is_epic:
                epic_data = {
                    "github_epic_number": issue["number"],
                    "github_url": issue["html_url"],
                    "title": issue["title"],
                    "body": issue.get("body", ""),
                    "state": issue["state"],
                    "labels": [label.get("name", "") for label in issue_labels],
                    "ai_generated": False
                }
                if sync_epic(epic_data, supabase):
                    return True, f"Epic #{issue['number']}"
            else:
                issue_type_label = next(
                    (label.get("name", "") for label in issue_labels if label.get("name", "").startswith("type:")),
                    "task"
                )
                issue_type_value = issue_type_label.replace("type:", "")

                issue_data = {
                    "github_issue_number": issue["number"],
                    "github_url": issue["html_url"],
                    "title": issue["title"],
                    "body": issue.get("body", ""),
                    "state": issue["state"],
                    "issue_type": issue_type_value,
                    "labels": [label.get("name", "") for label in issue_labels],
                    "ai_generated": False
                }
                if sync_issue(issue_data, supabase):
                    return True, f"Issue #{issue['number']}"
            return False, f"#{issue['number']} (skipped)"
        except Exception as e:
            return False, f"#{issue.get('number', 'unknown')} (error: {e})"

    # Parallel sync
    print("Running batch sync...")
    start_time = datetime.now()

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(sync_single_issue, issue): issue for issue in issues_only}

        completed = 0
        for future in as_completed(futures):
            completed += 1
            success, message = future.result()

            if success:
                total_synced += 1
            else:
                total_errors += 1

            # Progress display (every 10 items)
            if completed % 10 == 0 or completed == len(issues_only):
                elapsed = (datetime.now() - start_time).total_seconds()
                rate = completed / elapsed if elapsed > 0 else 0
                remaining = (len(issues_only) - completed) / rate if rate > 0 else 0
                print(f"   Progress: {completed}/{len(issues_only)} ({completed*100//len(issues_only)}%) | "
                      f"OK: {total_synced} | Errors: {total_errors} | "
                      f"ETA: {remaining:.1f}s", end="\r")

    print()
    elapsed = (datetime.now() - start_time).total_seconds()
    print(f"Sync complete: {total_synced} OK / {total_errors} errors / {len(issues_only)} total")
    print(f"Duration: {elapsed:.1f}s")


def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description="GitHub -> Supabase Sync (sns-auto-post)")
    parser.add_argument("--repo", default=None, help="Repository name override (default: from GITHUB_REPOSITORY env)")
    parser.add_argument("--sync-all", action="store_true", help="Sync all Issues/PRs (batch mode)")
    parser.add_argument("--sync-prs", action="store_true", help="Sync PR information")
    parser.add_argument("--sync-branches", action="store_true", help="Sync branch information")
    parser.add_argument("--full-sync", action="store_true", help="Full sync (Issues + PRs + Branches)")
    parser.add_argument("--batch-size", type=int, default=100, help="Batch size (default: 100)")
    parser.add_argument("--max-workers", type=int, default=10, help="Number of parallel workers (default: 10)")
    args = parser.parse_args()

    print("GitHub -> Supabase sync starting")
    print("=" * 60)

    try:
        supabase = get_supabase_client()
    except ValueError as e:
        print(f"Error: {e}")
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables")
        sys.exit(1)

    repo_name = args.repo or os.getenv("GITHUB_REPOSITORY", "Seventh-Sense-Systems-S3/sns-auto-post")

    # Full sync: Issues + PRs + Branches
    if args.full_sync:
        print("Full Sync mode: Issues + PRs + Branches")
        print()
        sync_all_issues(supabase, repo_name, args.batch_size, args.max_workers)
        print()
        sync_all_prs(supabase, repo_name)
        print()
        sync_branches(supabase, repo_name)
        return

    # PR sync mode
    if args.sync_prs:
        sync_all_prs(supabase, repo_name)
        return

    # Branch sync mode
    if args.sync_branches:
        sync_branches(supabase, repo_name)
        return

    # All issues sync mode
    if args.sync_all:
        sync_all_issues(supabase, repo_name, args.batch_size, args.max_workers)
        return

    # Event-driven sync (single issue from GHA event)
    if not os.getenv("GITHUB_ISSUE_LABELS"):
        labels = get_issue_labels_from_event()
        os.environ["GITHUB_ISSUE_LABELS"] = labels

    issue_number = os.getenv("GITHUB_ISSUE_NUMBER")
    issue_title = os.getenv("GITHUB_ISSUE_TITLE")
    issue_body = os.getenv("GITHUB_ISSUE_BODY", "")
    issue_state = os.getenv("GITHUB_ISSUE_STATE", "open")
    issue_labels_json = os.getenv("GITHUB_ISSUE_LABELS", "[]")
    issue_labels = json.loads(issue_labels_json) if issue_labels_json else []

    print(f"Issue info:")
    print(f"  Number: {issue_number}")
    print(f"  Title: {issue_title}")
    print(f"  State: {issue_state}")
    print(f"  Labels: {len(issue_labels)}")
    print()

    if not issue_number or issue_number == "0":
        print("Warning: GITHUB_ISSUE_NUMBER not set or invalid, skipping sync")
        return

    try:
        issue_number = int(issue_number)
    except ValueError:
        print(f"Warning: Invalid issue number: {issue_number}, skipping sync")
        return
    github_url = f"https://github.com/{repo_name}/issues/{issue_number}"

    # Determine if Epic or Issue
    is_epic = any(label.get("name", "").startswith("type:epic") for label in issue_labels)

    if is_epic:
        epic_data = {
            "github_epic_number": issue_number,
            "github_url": github_url,
            "title": issue_title,
            "body": issue_body,
            "state": issue_state,
            "labels": [label.get("name", "") for label in issue_labels],
            "ai_generated": False
        }
        sync_epic(epic_data, supabase)
    else:
        issue_type_label = next(
            (label.get("name", "") for label in issue_labels if label.get("name", "").startswith("type:")),
            "task"
        )
        issue_type_value = issue_type_label.replace("type:", "")

        issue_data = {
            "github_issue_number": issue_number,
            "github_url": github_url,
            "title": issue_title,
            "body": issue_body,
            "state": issue_state,
            "issue_type": issue_type_value,
            "labels": [label.get("name", "") for label in issue_labels],
            "ai_generated": False
        }
        sync_issue(issue_data, supabase)

    print("=" * 60)
    print("Sync complete")


if __name__ == "__main__":
    main()
