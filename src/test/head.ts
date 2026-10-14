const initialHead = document.head.innerHTML;
const initialTitle = document.title;

// Puts <head> and the title back as they were when this file loaded, so one
// test's page metadata never reaches the next.
export const resetHead = () => {
  document.head.innerHTML = initialHead;
  document.title = initialTitle;
};

export const headValue = (selector: string, attr = "content") =>
  document.head.querySelector(selector)?.getAttribute(attr) ?? null;

export const headCount = (selector: string) =>
  document.head.querySelectorAll(selector).length;
