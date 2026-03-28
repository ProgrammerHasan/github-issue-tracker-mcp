import { Octokit } from "@octokit/rest";

// ============================================================================
// GitHub Client
// ============================================================================

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// ============================================================================
// Types
// ============================================================================

export interface ListIssuesInput {
  owner: string;
  repo: string;
  state?: "open" | "closed" | "all";
}

export interface ListIssuesResult {
  issues: string;
}

export interface TriageIssueInput {
  owner: string;
  repo: string;
  issue_number: number;
}

export interface TriageIssueResult {
  message: string;
  label: string;
}

export interface WeeklyDigestInput {
  owner: string;
  repo: string;
}

export interface WeeklyDigestResult {
  count: number;
  summary: string;
}

export interface ReleaseNotesInput {
  owner: string;
  repo: string;
}

export interface ReleaseNotesResult {
  notes: string;
}

export interface AddCommentInput {
  owner: string;
  repo: string;
  issue_number: number;
  body: string;
}

export interface AddCommentResult {
  status: "success" | "error";
  message: string;
}

// ============================================================================
// Tool Functions (Pure Logic)
// ============================================================================

// 1. List Issues
export async function listIssues(
    input: ListIssuesInput,
): Promise<ListIssuesResult> {
  const { owner, repo, state = "open" } = input;

  try {
    const { data: issues } = await octokit.issues.listForRepo({
      owner,
      repo,
      state,
      per_page: 10,
    });

    const list = issues
        .filter((i) => !i.pull_request)
        .map((i) => `#${i.number}: ${i.title}`)
        .join("\n");

    return {
      issues: list || "No issues found.",
    };
  } catch (error: any) {
    return {
      issues: `Error fetching issues: ${error.message}`,
    };
  }
}

// 2. Triage Issue
export async function triageIssue(
    input: TriageIssueInput,
): Promise<TriageIssueResult> {
  const { owner, repo, issue_number } = input;

  try {
    const { data: issue } = await octokit.issues.get({
      owner,
      repo,
      issue_number,
    });

    const label = (issue.title + (issue.body || ""))
        .toLowerCase()
        .includes("bug")
        ? "bug"
        : "enhancement";

    await octokit.issues.addLabels({
      owner,
      repo,
      issue_number,
      labels: [label],
    });

    return {
      message: `Issue #${issue_number} labeled as: ${label}`,
      label,
    };
  } catch (error: any) {
    return {
      message: `Failed to triage issue: ${error.message}`,
      label: "error",
    };
  }
}

// 3. Weekly Digest
export async function weeklyDigest(
    input: WeeklyDigestInput,
): Promise<WeeklyDigestResult> {
  const { owner, repo } = input;

  try {
    const sevenDaysAgo = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: issues } = await octokit.issues.listForRepo({
      owner,
      repo,
      state: "all",
      since: sevenDaysAgo,
    });

    return {
      count: issues.length,
      summary: `Last 7 days: ${issues.length} updates in ${owner}/${repo}.`,
    };
  } catch (error: any) {
    return {
      count: 0,
      summary: `Error generating digest: ${error.message}`,
    };
  }
}

// 4. Release Notes
export async function releaseNotes(
    input: ReleaseNotesInput,
): Promise<ReleaseNotesResult> {
  const { owner, repo } = input;

  try {
    const { data: prs } = await octokit.pulls.list({
      owner,
      repo,
      state: "closed",
      per_page: 10,
    });

    const notes = prs
        .filter((pr) => pr.merged_at)
        .map(
            (pr) =>
                `- ${pr.title} (#${pr.number}) by @${pr.user?.login}`,
        )
        .join("\n");

    return {
      notes: notes || "No recent merged PRs found.",
    };
  } catch (error: any) {
    return {
      notes: `Error generating release notes: ${error.message}`,
    };
  }
}

// 5. Add Comment
export async function addComment(
    input: AddCommentInput,
): Promise<AddCommentResult> {
  const { owner, repo, issue_number, body } = input;

  try {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number,
      body,
    });

    return {
      status: "success",
      message: `Comment added to #${issue_number}`,
    };
  } catch (error: any) {
    return {
      status: "error",
      message: `Failed to add comment: ${error.message}`,
    };
  }
}