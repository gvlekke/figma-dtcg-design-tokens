import { useEffect, useMemo, useState } from "preact/hooks";
import { convertExport, type ConversionResult } from "../shared/dtcg/convert";
import { DEFAULT_SETTINGS, type ExportData, type GitLabSettings } from "../shared/types";
import { onMainMessage, postToMain } from "./figmaBridge";
import { SettingsPanel } from "./components/SettingsPanel";
import { ExportPanel } from "./components/ExportPanel";
import { PushPanel } from "./components/PushPanel";

type Tab = "export" | "push" | "settings";

export function App() {
  const [tab, setTab] = useState<Tab>("export");
  const [settings, setSettings] = useState<GitLabSettings>(DEFAULT_SETTINGS);
  const [pat, setPat] = useState("");
  const [data, setData] = useState<ExportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const off = onMainMessage((message) => {
      switch (message.type) {
        case "settings":
          setSettings(message.settings);
          setPat(message.pat);
          break;
        case "export-result":
          setData(message.data);
          setLoading(false);
          setError(null);
          break;
        case "export-error":
          setError(message.message);
          setLoading(false);
          break;
      }
    });
    postToMain({ type: "init" });
    postToMain({ type: "export" });
    return off;
  }, []);

  const conversion: ConversionResult | null = useMemo(
    () => (data ? convertExport(data) : null),
    [data]
  );

  function updateSettings(next: GitLabSettings) {
    setSettings(next);
    postToMain({ type: "save-settings", settings: next });
  }

  function updatePat(next: string) {
    setPat(next);
    postToMain({ type: "save-pat", pat: next });
  }

  function reload() {
    setLoading(true);
    postToMain({ type: "export" });
  }

  return (
    <>
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "export"} onClick={() => setTab("export")}>
          Tokens
        </button>
        <button role="tab" aria-selected={tab === "push"} onClick={() => setTab("push")}>
          Push
        </button>
        <button role="tab" aria-selected={tab === "settings"} onClick={() => setTab("settings")}>
          Settings
        </button>
      </div>

      {error && (
        <div class="panel" style="flex: 0 0 auto; padding-bottom: 0">
          <div class="banner error">{error}</div>
        </div>
      )}

      {tab === "export" && (
        <ExportPanel data={data} conversion={conversion} loading={loading} onReload={reload} />
      )}
      {tab === "push" && (
        <PushPanel
          settings={settings}
          pat={pat}
          conversion={conversion}
          onChange={updateSettings}
        />
      )}
      {tab === "settings" && (
        <SettingsPanel
          settings={settings}
          pat={pat}
          onChange={updateSettings}
          onPatChange={updatePat}
        />
      )}
    </>
  );
}
