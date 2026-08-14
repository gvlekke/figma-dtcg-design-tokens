import type { MainToUiMessage, UiToMainMessage } from "../shared/types";

export function postToMain(message: UiToMainMessage): void {
  parent.postMessage({ pluginMessage: message }, "*");
}

export function onMainMessage(handler: (message: MainToUiMessage) => void): () => void {
  const listener = (event: MessageEvent) => {
    const message = event.data?.pluginMessage as MainToUiMessage | undefined;
    if (message) handler(message);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

export function notify(message: string, error = false): void {
  postToMain({ type: "notify", message, error });
}
