import { useState } from "preact/hooks";
import type { GitLabSettings } from "../../shared/types";
import { GitLabClient, GitLabError } from "../gitlab";

interface Props {
  settings: GitLabSettings;
  pat: string;
  onChange: (settings: GitLabSettings) => void;
  onPatChange: (pat: string) => void;
}

export function SettingsPanel({ settings, pat, onChange, onPatChange }: Props) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const set = <K extends keyof GitLabSettings>(key: K, value: GitLabSettings[K]) => {
    onChange({ ...settings, [key]: value });
    setResult(null);
  };

  async function testConnection() {
    setTesting(true);
    setResult(null);
    try {
      const project = await new GitLabClient(settings, pat).getProject();
      setResult({
        ok: true,
        message: `Connected to ${project.path_with_namespace} (default branch: ${project.default_branch})`
      });
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof GitLabError || error instanceof Error ? error.message : String(error)
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div class="panel">
      <label>
        GitLab instance URL
        <input
          type="url"
          placeholder="https://gitlab.example.com"
          value={settings.instanceUrl}
          onInput={(e) => set("instanceUrl", (e.target as HTMLInputElement).value)}
        />
      </label>

      <label>
        Project
        <span class="hint">Numeric project id, or full path like design-system/tokens</span>
        <input
          placeholder="design-system/tokens"
          value={settings.projectId}
          onInput={(e) => set("projectId", (e.target as HTMLInputElement).value)}
        />
      </label>

      <label>
        Personal access token
        <span class="hint">Needs the api scope. Stored only in your local Figma client storage.</span>
        <input
          type="password"
          placeholder="glpat-…"
          value={pat}
          onInput={(e) => {
            onPatChange((e.target as HTMLInputElement).value);
            setResult(null);
          }}
        />
      </label>

      <label>
        Token directory
        <span class="hint">Repo directory the token files live in. Branch, push flow and commit message are on the Push tab.</span>
        <input
          placeholder="tokens"
          value={settings.basePath}
          onInput={(e) => set("basePath", (e.target as HTMLInputElement).value)}
        />
      </label>

      <div class="row">
        <button class="secondary" onClick={testConnection} disabled={testing}>
          {testing ? "Testing…" : "Test connection"}
        </button>
      </div>

      {result && <div class={`banner ${result.ok ? "success" : "error"}`}>{result.message}</div>}
    </div>
  );
}
