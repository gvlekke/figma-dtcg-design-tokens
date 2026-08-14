/**
 * Serializable intermediate model passed from the plugin main thread to the UI.
 * The UI converts this model to DTCG files; keeping conversion out of the main
 * thread lets diffing and zip export reuse the same code.
 */

export type VariableModeValue =
  | { kind: "color"; r: number; g: number; b: number; a: number }
  | { kind: "float"; value: number }
  | { kind: "string"; value: string }
  | { kind: "boolean"; value: boolean }
  /** EASING variable reduced to cubic bezier control points */
  | { kind: "cubicBezier"; points: [number, number, number, number] }
  | { kind: "alias"; id: string };

export type VariableResolvedType = "COLOR" | "FLOAT" | "STRING" | "BOOLEAN" | "EASING" | "TIMING";

export interface VariableData {
  id: string;
  /** Figma variable name, slash-separated groups, e.g. "bg/primary" */
  name: string;
  description: string;
  resolvedType: VariableResolvedType;
  scopes: string[];
  codeSyntax: Record<string, string>;
  valuesByMode: Record<string, VariableModeValue>;
}

export interface ModeData {
  modeId: string;
  name: string;
}

export interface CollectionData {
  id: string;
  name: string;
  defaultModeId: string;
  modes: ModeData[];
  variables: VariableData[];
}

/**
 * Lookup for alias targets: variable id -> owning collection + name.
 * Includes remote (library) variables referenced by local aliases.
 */
export interface AliasTarget {
  collectionId: string;
  collectionName: string;
  name: string;
  remote: boolean;
}

export interface TextStyleData {
  id: string;
  name: string;
  description: string;
  fontFamily: string;
  /** Figma font style string, e.g. "Bold Italic" */
  fontStyle: string;
  fontSize: number;
  letterSpacing: { unit: "PIXELS" | "PERCENT"; value: number };
  lineHeight: { unit: "PIXELS" | "PERCENT" | "AUTO"; value?: number };
  boundVariables: Partial<Record<"fontFamily" | "fontSize" | "letterSpacing" | "lineHeight" | "fontStyle", string>>;
}

export interface ShadowEffectData {
  type: "DROP_SHADOW" | "INNER_SHADOW";
  color: { r: number; g: number; b: number; a: number };
  offset: { x: number; y: number };
  radius: number;
  spread: number;
}

export interface EffectStyleData {
  id: string;
  name: string;
  description: string;
  shadows: ShadowEffectData[];
  /** Effect types present on the style that we cannot represent (e.g. blurs) */
  skippedEffectTypes: string[];
}

export interface GradientStopData {
  position: number;
  color: { r: number; g: number; b: number; a: number };
}

export type PaintData =
  | { kind: "solid"; color: { r: number; g: number; b: number; a: number }; boundColorVariableId?: string }
  | { kind: "gradient"; gradientType: string; stops: GradientStopData[] };

export interface PaintStyleData {
  id: string;
  name: string;
  description: string;
  /** First representable paint of the style; null when none (e.g. image fill) */
  paint: PaintData | null;
  skippedPaintTypes: string[];
}

export interface StylesData {
  text: TextStyleData[];
  effect: EffectStyleData[];
  paint: PaintStyleData[];
}

export interface ExportData {
  fileName: string;
  collections: CollectionData[];
  aliasTargets: Record<string, AliasTarget>;
  styles: StylesData;
  /** Warnings gathered while reading the Figma document */
  warnings: string[];
}

/** GitLab connection + push settings, persisted via figma.clientStorage */
export interface GitLabSettings {
  instanceUrl: string;
  /** Numeric id or full path like "group/project" */
  projectId: string;
  targetBranch: string;
  /** Repo directory the token files live in, e.g. "tokens" */
  basePath: string;
  flow: "commit" | "mr";
  commitMessageTemplate: string;
}

export const DEFAULT_SETTINGS: GitLabSettings = {
  instanceUrl: "",
  projectId: "",
  targetBranch: "main",
  basePath: "tokens",
  flow: "commit",
  commitMessageTemplate: "chore(tokens): sync design tokens from Figma"
};

/* ---- main <-> UI message protocol ---- */

export type UiToMainMessage =
  | { type: "init" }
  | { type: "export" }
  | { type: "save-settings"; settings: GitLabSettings }
  | { type: "save-pat"; pat: string }
  | { type: "notify"; message: string; error?: boolean };

export type MainToUiMessage =
  | { type: "settings"; settings: GitLabSettings; pat: string }
  | { type: "export-result"; data: ExportData }
  | { type: "export-error"; message: string };
