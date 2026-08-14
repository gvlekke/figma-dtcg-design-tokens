import type { GitLabSettings } from "../shared/types";

export interface GitLabProject {
  id: number;
  path_with_namespace: string;
  default_branch: string;
  web_url: string;
}

export interface TreeEntry {
  path: string;
  type: "blob" | "tree";
}

export interface CommitAction {
  action: "create" | "update" | "delete";
  file_path: string;
  content?: string;
}

export interface CommitResult {
  id: string;
  web_url: string;
}

export interface MergeRequestResult {
  iid: number;
  web_url: string;
}

export class GitLabError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "GitLabError";
  }
}

function normalizeBaseUrl(instanceUrl: string): string {
  const trimmed = instanceUrl.trim().replace(/\/+$/, "");
  if (!trimmed) throw new GitLabError("GitLab instance URL is required");
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new GitLabError("GitLab instance URL must start with http:// or https://");
  }
  return `${trimmed}/api/v4`;
}

/** Numeric ids pass through; "group/project" paths must be URL-encoded. */
function encodeProjectId(projectId: string): string {
  const trimmed = projectId.trim();
  if (!trimmed) throw new GitLabError("GitLab project id or path is required");
  return /^\d+$/.test(trimmed) ? trimmed : encodeURIComponent(trimmed);
}

/** Repo paths keep no leading slash and are encoded whole, including separators. */
export function joinRepoPath(basePath: string, filePath: string): string {
  const base = basePath.trim().replace(/^\/+|\/+$/g, "");
  return base ? `${base}/${filePath}` : filePath;
}

export class GitLabClient {
  private readonly baseUrl: string;
  private readonly projectRef: string;

  constructor(
    settings: Pick<GitLabSettings, "instanceUrl" | "projectId">,
    private readonly token: string
  ) {
    this.baseUrl = normalizeBaseUrl(settings.instanceUrl);
    this.projectRef = encodeProjectId(settings.projectId);
    if (!token.trim()) throw new GitLabError("A GitLab personal access token is required");
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/projects/${this.projectRef}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          "PRIVATE-TOKEN": this.token,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.headers ?? {})
        }
      });
    } catch (error) {
      throw new GitLabError(
        `Could not reach ${this.baseUrl}. Check the instance URL, and make sure the GitLab instance allows cross-origin requests from Figma (its reverse proxy must not strip CORS headers). Original error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    if (!response.ok) {
      throw new GitLabError(await this.describeError(response), response.status);
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async describeError(response: Response): Promise<string> {
    let detail = "";
    try {
      const body = await response.text();
      const parsed = body ? (JSON.parse(body) as Record<string, unknown>) : {};
      detail = String(parsed.message ?? parsed.error ?? body).slice(0, 300);
    } catch {
      /* keep detail empty when the body is not JSON */
    }
    switch (response.status) {
      case 401:
        return "GitLab rejected the token (401). Check that the personal access token is valid and has the 'api' scope.";
      case 403:
        return `GitLab denied the request (403). The token needs write access to this project${detail ? `: ${detail}` : "."}`;
      case 404:
        return "Project not found (404). Check the project id or path, and that the token can see this project.";
      default:
        return `GitLab returned ${response.status}${detail ? `: ${detail}` : ""}`;
    }
  }

  getProject(): Promise<GitLabProject> {
    return this.request<GitLabProject>("");
  }

  /** Lists blobs under a directory; returns [] when the directory does not exist yet. */
  async listTree(path: string, ref: string): Promise<TreeEntry[]> {
    const entries: TreeEntry[] = [];
    let page = 1;
    for (;;) {
      const query = new URLSearchParams({
        ref,
        recursive: "true",
        per_page: "100",
        page: String(page)
      });
      if (path) query.set("path", path);
      let batch: TreeEntry[];
      try {
        batch = await this.request<TreeEntry[]>(`/repository/tree?${query.toString()}`);
      } catch (error) {
        // An empty repo or a missing tokens directory both surface as 404.
        if (error instanceof GitLabError && error.status === 404) return entries;
        throw error;
      }
      if (!batch || batch.length === 0) break;
      entries.push(...batch);
      if (batch.length < 100) break;
      page += 1;
    }
    return entries;
  }

  /** Raw file contents, or null when the file does not exist on that ref. */
  async getFileContent(repoPath: string, ref: string): Promise<string | null> {
    const url = `${this.baseUrl}/projects/${this.projectRef}/repository/files/${encodeURIComponent(
      repoPath
    )}/raw?ref=${encodeURIComponent(ref)}`;
    let response: Response;
    try {
      response = await fetch(url, { headers: { "PRIVATE-TOKEN": this.token } });
    } catch (error) {
      throw new GitLabError(
        `Could not read ${repoPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new GitLabError(await this.describeError(response), response.status);
    return response.text();
  }

  async branchExists(branch: string): Promise<boolean> {
    try {
      await this.request(`/repository/branches/${encodeURIComponent(branch)}`);
      return true;
    } catch (error) {
      if (error instanceof GitLabError && error.status === 404) return false;
      throw error;
    }
  }

  createBranch(branch: string, ref: string): Promise<unknown> {
    return this.request("/repository/branches", {
      method: "POST",
      body: JSON.stringify({ branch, ref })
    });
  }

  /** One atomic commit for all token files. */
  commit(branch: string, message: string, actions: CommitAction[]): Promise<CommitResult> {
    return this.request<CommitResult>("/repository/commits", {
      method: "POST",
      body: JSON.stringify({ branch, commit_message: message, actions })
    });
  }

  createMergeRequest(
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description: string
  ): Promise<MergeRequestResult> {
    return this.request<MergeRequestResult>("/merge_requests", {
      method: "POST",
      body: JSON.stringify({
        source_branch: sourceBranch,
        target_branch: targetBranch,
        title,
        description,
        remove_source_branch: true
      })
    });
  }
}
