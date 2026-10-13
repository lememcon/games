// Copy text to the clipboard. The async Clipboard API only exists in secure
// contexts (HTTPS/localhost), so fall back to a hidden textarea and execCommand.
// Never throws; resolves to whether the copy succeeded.
const legacyCopy = (text: string): boolean => {
  const previous = document.activeElement;
  const area = document.createElement("textarea");
  area.value = text;
  area.readOnly = true;
  area.setAttribute("aria-hidden", "true");
  area.style.position = "fixed";
  area.style.top = "-1000px";
  area.style.left = "-1000px";
  area.style.opacity = "0";
  try {
    document.body.appendChild(area);
    area.select();
    area.focus({ preventScroll: true });
    area.setSelectionRange(0, text.length);
    return document.execCommand?.("copy") === true;
  } catch {
    return false;
  } finally {
    area.remove();
    if (previous instanceof HTMLElement)
      previous.focus({ preventScroll: true });
  }
};

export const copyText = async (text: string): Promise<boolean> => {
  const clipboard = navigator.clipboard as Clipboard | undefined;
  if (clipboard) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Sync throw or rejection: fall through to the legacy path.
    }
  }
  return legacyCopy(text);
};
