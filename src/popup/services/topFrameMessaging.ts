/** Chrome frame id for the active tab's top-level document. */
const TOP_FRAME_ID = 0;

/**
 * Sends one addressed popup request to the active tab's top frame.
 *
 * @param type - Content message type.
 * @param payload - Optional message payload.
 * @returns The content response, or null when no tab or content script is reachable.
 */
export async function sendToActiveTopFrame<T>(
  type: string,
  payload?: unknown,
): Promise<T | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return null;
    const message: Record<string, unknown> = {
      type,
      target: 'content',
      source: 'popup',
      request: true,
    };
    if (payload !== undefined) message.payload = payload;
    return await chrome.tabs.sendMessage(tab.id, message, { frameId: TOP_FRAME_ID }) as T;
  } catch {
    return null;
  }
}
