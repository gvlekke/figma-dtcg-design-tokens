import JSZip from "jszip";
import type { ConversionResult } from "../../shared/dtcg/convert";
import type { ExportData } from "../../shared/types";
import { serializeFile } from "../push";

interface Props {
  data: ExportData | null;
  conversion: ConversionResult | null;
  loading: boolean;
  onReload: () => void;
}

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExportPanel({ data, conversion, loading, onReload }: Props) {
  async function downloadZip() {
    if (!conversion) return;
    const zip = new JSZip();
    for (const file of conversion.files) {
      zip.file(file.path, serializeFile(file));
    }
    download(await zip.generateAsync({ type: "blob" }), "design-tokens.zip");
  }

  if (loading || !data || !conversion) {
    return (
      <div class="panel">
        <p class="muted">Reading variables and styles from this file…</p>
      </div>
    );
  }

  const warnings = [...data.warnings, ...conversion.warnings];
  const variableCount = data.collections.reduce((sum, c) => sum + c.variables.length, 0);
  const styleCount = data.styles.text.length + data.styles.effect.length + data.styles.paint.length;

  return (
    <div class="panel">
      <p>
        <strong>{variableCount}</strong> variables in <strong>{data.collections.length}</strong>{" "}
        collections, <strong>{styleCount}</strong> styles → <strong>{conversion.files.length}</strong>{" "}
        files.
      </p>

      {data.collections.map((collection) => (
        <div class="card" key={collection.id}>
          <div class="row">
            <h3 class="grow">{collection.name}</h3>
            <span class="badge">{collection.variables.length} variables</span>
          </div>
          <p class="muted">
            {collection.modes.length === 1
              ? "Single mode"
              : `Modes: ${collection.modes.map((m) => m.name).join(", ")}`}
          </p>
        </div>
      ))}

      <div class="card">
        <h3>Files</h3>
        <ul class="list mono">
          {conversion.files.map((file) => (
            <li key={file.path}>{file.path}</li>
          ))}
        </ul>
      </div>

      {warnings.length > 0 && (
        <details class="banner warning">
          <summary>{warnings.length} conversion warnings</summary>
          <div>
            <ul class="list">
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        </details>
      )}

      <div class="row">
        <button class="secondary" onClick={onReload}>
          Re-read from Figma
        </button>
        <button class="secondary" onClick={downloadZip}>
          Download .zip
        </button>
      </div>
    </div>
  );
}
