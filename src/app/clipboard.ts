// Clipboard feedback follows the outcome of the write, including unavailable APIs.
export async function copyText(
  text: string,
  label: string,
  notify: (message: string) => void,
  clipboard: Pick<Clipboard, "writeText"> | undefined = navigator.clipboard,
): Promise<void> {
  try {
    if (!clipboard) throw new Error("Clipboard unavailable");
    await clipboard.writeText(text);
    notify(`Copied ${label}`);
  } catch {
    notify("Could not copy. Please try again.");
  }
}
