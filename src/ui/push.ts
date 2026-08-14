import type { GitLabSettings } from "../shared/types";
import { diffTokenFile, type FileDiff } from "../shared/dtcg/diff";
import type { TokenFile } from "../shared/dtcg/convert";
import { GitLabClient, joinRepoPath, type CommitAction } from "./gitlab";

export interface PlannedPush {
  diffs: FileDiff[];
  /** Files present in the repo that this export no longer produces */
  deletions: string[];
  hasChanges: boolean;
}

export interface PushOutcome {
  branch: string;
  commitUrl: string;
  mergeRequestUrl?: string;
}

/** Only files this plugin owns are ever updated or deleted. */
function isGeneratedTokenFile(path: string): boolean {
  return path.endsWith(".tokens.json") || path.endsWith("/resolver.json") || path === "resolver.json";
}

export function serializeFile(file: TokenFile): string {
  return `${JSON.stringify(file.content, null, 2)}\n`;
}

/**
 * Compares the export against the repo state on the target branch:
 * per-file token diffs plus generated files that disappeared from Figma.
 */
export async function planPush(
  client: GitLabClient,
  settings: GitLabSettings,
  files: TokenFile[]
): Promise<PlannedPush> {
  const basePath = settings.basePath.trim().replace(/^\/+|\/+$/g, "");
  const tree = await client.listTree(basePath, settings.targetBranch);
  const existing = new Set(
    tree
      .filter((entry) => entry.type === "blob" && isGeneratedTokenFile(entry.path))
      .map((entry) => entry.path)
  );

  const diffs: FileDiff[] = [];
  for (const file of files) {
    const repoPath = joinRepoPath(basePath, file.path);
    const current = existing.has(repoPath)
      ? await client.getFileContent(repoPath, settings.targetBranch)
      : null;
    diffs.push(diffTokenFile(file.path, current, file.content));
  }

  const generatedPaths = new Set(files.map((file) => joinRepoPath(basePath, file.path)));
  const deletions = [...existing].filter((path) => !generatedPaths.has(path)).sort();

  const hasChanges =
    deletions.length > 0 || diffs.some((diff) => diff.status !== "unchanged");

  return { diffs, deletions, hasChanges };
}

export function buildCommitActions(
  settings: GitLabSettings,
  files: TokenFile[],
  plan: PlannedPush
): CommitAction[] {
  const basePath = settings.basePath.trim().replace(/^\/+|\/+$/g, "");
  const byPath = new Map(plan.diffs.map((diff) => [diff.path, diff]));
  const actions: CommitAction[] = [];

  for (const file of files) {
    const diff = byPath.get(file.path);
    if (!diff || diff.status === "unchanged") continue;
    actions.push({
      action: diff.status === "new" ? "create" : "update",
      file_path: joinRepoPath(basePath, file.path),
      content: serializeFile(file)
    });
  }
  for (const path of plan.deletions) {
    actions.push({ action: "delete", file_path: path });
  }
  return actions;
}

function branchName(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "");
  return `figma-tokens/${stamp}`;
}

export async function pushTokens(
  client: GitLabClient,
  settings: GitLabSettings,
  files: TokenFile[],
  plan: PlannedPush,
  commitMessage: string
): Promise<PushOutcome> {
  const actions = buildCommitActions(settings, files, plan);
  if (actions.length === 0) {
    throw new Error("Nothing to push: the repository already matches these tokens.");
  }

  if (settings.flow === "commit") {
    const commit = await client.commit(settings.targetBranch, commitMessage, actions);
    return { branch: settings.targetBranch, commitUrl: commit.web_url };
  }

  const branch = branchName();
  await client.createBranch(branch, settings.targetBranch);
  const commit = await client.commit(branch, commitMessage, actions);
  const summary = plan.diffs
    .filter((diff) => diff.status !== "unchanged")
    .map(
      (diff) =>
        `- \`${diff.path}\` (${diff.status}): +${diff.added.length} / ~${diff.changed.length} / -${diff.removed.length}`
    )
    .concat(plan.deletions.map((path) => `- \`${path}\`: removed`))
    .join("\n");
  const mr = await client.createMergeRequest(
    branch,
    settings.targetBranch,
    commitMessage,
    `Design tokens exported from Figma.\n\n${summary}\n`
  );
  return { branch, commitUrl: commit.web_url, mergeRequestUrl: mr.web_url };
}
