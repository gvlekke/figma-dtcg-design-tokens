import { useState } from "preact/hooks";
import type { ConversionResult } from "../../shared/dtcg/convert";
import type { FileDiff } from "../../shared/dtcg/diff";
import type { GitLabSettings } from "../../shared/types";
import { GitLabClient } from "../gitlab";
import { planPush, pushTokens, type PlannedPush, type PushOutcome } from "../push";
import { notify } from "../figmaBridge";

interface Props {
  settings: GitLabSettings;
  pat: string;
  conversion: ConversionResult | null;
  onChange: (settings: GitLabSettings) => void;
}

function DiffRow({ diff }: { diff: FileDiff }) {
  const tokens = [
    ...diff.added.map((path) => ({ path, kind: "added" as const })),
    ...diff.changed.map((path) => ({ path, kind: "changed" as const })),
    ...diff.removed.map((path) => ({ path, kind: "removed" as const }))
  ];
  return (
    <div class="card">
      <div class="row">
        <span class="grow mono">{diff.path}</span>
        {diff.added.length > 0 && <span class="badge added">+{diff.added.length}</span>}
        {diff.changed.length > 0 && <span class="badge changed">~{diff.changed.length}</span>}
        {diff.removed.length > 0 && <span class="badge removed">−{diff.removed.length}</span>}
        {diff.status === "new" && <span class="badge added">new file</span>}
        {diff.status === "replaced" && <span class="badge changed">unparsable, replaced</span>}
      </div>
      {tokens.length > 0 && (
        <details>
          <summary class="muted">{tokens.length} tokens</summary>
          <div>
            <ul class="list mono">
              {tokens.slice(0, 200).map((token) => (
                <li key={`${token.kind}-${token.path}`}>
                  <span class={`badge ${token.kind}`}>{token.kind}</span> {token.path}
                </li>
              ))}
              {tokens.length > 200 && <li class="muted">…and {tokens.length - 200} more</li>}
            </ul>
          </div>
        </details>
      )}
    </div>
  );
}

export function PushPanel({ settings, pat, conversion, onChange }: Props) {
  const [plan, setPlan] = useState<PlannedPush | null>(null);
  const [busy, setBusy] = useState<"" | "plan" | "push">("");
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<PushOutcome | null>(null);

  const message = settings.commitMessageTemplate;
  const ready = Boolean(settings.instanceUrl && settings.projectId && pat && conversion);

  const set = <K extends keyof GitLabSettings>(key: K, value: GitLabSettings[K]) => {
    onChange({ ...settings, [key]: value });
    // The plan was compared against the previous branch, so it no longer applies.
    if (key === "targetBranch") {
      setPlan(null);
      setOutcome(null);
    }
  };

  async function refreshPlan() {
    if (!conversion) return;
    setBusy("plan");
    setError(null);
    setOutcome(null);
    try {
      const client = new GitLabClient(settings, pat);
      setPlan(await planPush(client, settings, conversion.files));
    } catch (err) {
      setPlan(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function push() {
    if (!conversion || !plan) return;
    setBusy("push");
    setError(null);
    try {
      const client = new GitLabClient(settings, pat);
      const result = await pushTokens(client, settings, conversion.files, plan, message.trim());
      setOutcome(result);
      setPlan(null);
      notify(
        result.mergeRequestUrl
          ? `Merge request opened from ${result.branch}`
          : `Tokens committed to ${result.branch}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  const changed = plan?.diffs.filter((diff) => diff.status !== "unchanged") ?? [];

  return (
    <div class="panel">
      {!ready && (
        <div class="banner warning">
          Fill in the GitLab instance, project and access token on the Settings tab first.
        </div>
      )}

      <div class="card">
        <div class="row">
          <label class="grow">
            Target branch
            <input
              value={settings.targetBranch}
              onInput={(e) => set("targetBranch", (e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="grow">
            Push flow
            <select
              value={settings.flow}
              onChange={(e) => set("flow", (e.target as HTMLSelectElement).value as GitLabSettings["flow"])}
            >
              <option value="commit">Commit to the target branch</option>
              <option value="mr">Branch and merge request</option>
            </select>
          </label>
        </div>

        <label>
          Commit message
          <input
            value={message}
            onInput={(e) => set("commitMessageTemplate", (e.target as HTMLInputElement).value)}
          />
        </label>
      </div>

      <div class="row">
        <button class="secondary" onClick={refreshPlan} disabled={!ready || busy !== ""}>
          {busy === "plan" ? "Comparing…" : "Compare with GitLab"}
        </button>
        <span class="muted">
          {settings.basePath ? `${settings.basePath}/` : "repository root"}
        </span>
      </div>

      {error && <div class="banner error">{error}</div>}

      {outcome && (
        <div class="banner success">
          <p>
            {outcome.mergeRequestUrl ? "Merge request created" : "Committed"} on{" "}
            <span class="mono">{outcome.branch}</span>.
          </p>
          <p class="mono">{outcome.mergeRequestUrl ?? outcome.commitUrl}</p>
        </div>
      )}

      {plan && !plan.hasChanges && (
        <div class="banner success">
          The repository already matches these tokens — nothing to push.
        </div>
      )}

      {plan?.hasChanges && (
        <>
          <h2>
            {changed.length} changed {changed.length === 1 ? "file" : "files"}
            {plan.deletions.length > 0 ? `, ${plan.deletions.length} to delete` : ""}
          </h2>
          {changed.map((diff) => (
            <DiffRow diff={diff} key={diff.path} />
          ))}
          {plan.deletions.length > 0 && (
            <div class="card">
              <h3>Files no longer produced by this file</h3>
              <ul class="list mono">
                {plan.deletions.map((path) => (
                  <li key={path}>
                    <span class="badge removed">delete</span> {path}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div class="row">
            <button class="primary" onClick={push} disabled={busy !== "" || message.trim() === ""}>
              {busy === "push"
                ? "Pushing…"
                : settings.flow === "mr"
                  ? "Push and open merge request"
                  : `Commit to ${settings.targetBranch}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
