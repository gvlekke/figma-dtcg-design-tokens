import { DEFAULT_SETTINGS, type GitLabSettings } from "../shared/types";

const SETTINGS_KEY = "gitlab-settings";
const PAT_KEY = "gitlab-pat";

export async function loadSettings(): Promise<{ settings: GitLabSettings; pat: string }> {
  const stored = (await figma.clientStorage.getAsync(SETTINGS_KEY)) as
    | Partial<GitLabSettings>
    | undefined;
  const pat = ((await figma.clientStorage.getAsync(PAT_KEY)) as string | undefined) ?? "";
  return { settings: { ...DEFAULT_SETTINGS, ...stored }, pat };
}

export async function saveSettings(settings: GitLabSettings): Promise<void> {
  await figma.clientStorage.setAsync(SETTINGS_KEY, settings);
}

export async function savePat(pat: string): Promise<void> {
  await figma.clientStorage.setAsync(PAT_KEY, pat);
}
