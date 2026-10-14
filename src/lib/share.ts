// Share a link through the browser's native share sheet (Web Share API). It
// only exists on some browsers and in secure contexts, so check for support up
// front. shareLink never throws; it reports how the attempt ended.
export const canShareLink = (data: ShareData): boolean => {
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return true;
  try {
    return navigator.canShare(data);
  } catch {
    return false;
  }
};

export type ShareResult = "shared" | "cancelled" | "failed";

export const shareLink = async (data: ShareData): Promise<ShareResult> => {
  if (typeof navigator.share !== "function") return "failed";
  try {
    await navigator.share(data);
    return "shared";
  } catch (e) {
    const name = (e as { name?: unknown } | null)?.name;
    // AbortError: the user dismissed the sheet. InvalidStateError: a share is
    // already open. Neither is a failure worth falling back from.
    return name === "AbortError" || name === "InvalidStateError"
      ? "cancelled"
      : "failed";
  }
};
