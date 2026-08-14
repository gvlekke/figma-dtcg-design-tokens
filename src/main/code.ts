import type { ExportData, MainToUiMessage, UiToMainMessage } from "../shared/types";
import { readVariables } from "./readVariables";
import { readStyles } from "./readStyles";
import { loadSettings, savePat, saveSettings } from "./storage";

figma.showUI(__html__, { width: 480, height: 640, themeColors: true });

function post(message: MainToUiMessage): void {
  figma.ui.postMessage(message);
}

async function exportTokens(): Promise<ExportData> {
  const warnings: string[] = [];
  const { collections, aliasTargets } = await readVariables(warnings);
  const styles = await readStyles(warnings);
  return {
    fileName: figma.root.name,
    collections,
    aliasTargets,
    styles,
    warnings
  };
}

figma.ui.onmessage = async (message: UiToMainMessage) => {
  try {
    switch (message.type) {
      case "init": {
        const { settings, pat } = await loadSettings();
        post({ type: "settings", settings, pat });
        break;
      }
      case "export": {
        const data = await exportTokens();
        post({ type: "export-result", data });
        break;
      }
      case "save-settings":
        await saveSettings(message.settings);
        break;
      case "save-pat":
        await savePat(message.pat);
        break;
      case "notify":
        figma.notify(message.message, { error: message.error ?? false });
        break;
    }
  } catch (error) {
    post({
      type: "export-error",
      message: error instanceof Error ? error.message : String(error)
    });
  }
};
