// TTdown's notifications: short, transient messages ("Saved", "Deleted ...", "Couldn't read that file") shown as toasts with Ding
// (https://ding.yusufcengiz.dev/). Only this file may import "@yusufceng1z/ding" (npm run check enforces it), the same rule as ui-sdk.
// Persistent state stays inline in the page (the #status line, "out of date" notices, the drumless notice): a toast is for an event
// that has happened, not for something that is still true.
import { toast, mountToaster } from "@yusufceng1z/ding";

export type NoteKind = "success" | "error" | "warning" | "info";

let unmount: (() => void) | null = null;
/** Mount the toaster once, at the app root. Safe to call again (the second call does nothing). */
export function mountNotes(): () => void {
  if (!unmount) unmount = mountToaster({ position: "bottom-center", theme: "dark" });
  return () => { unmount?.(); unmount = null; };
}

// Reading time: about 60 ms a character, at least 4 s, at most 15 s. Errors stay until dismissed (Ding's default for them).
const readFor = (text: string) => Math.min(15000, Math.max(4000, text.length * 60));

/** Say what just happened. Errors stay until dismissed; everything else closes by itself once there has been time to read it. */
export function notify(kind: NoteKind, text: string): void {
  toast[kind](text, kind === "error" ? {} : { duration: readFor(text) });
}

/** A step that takes a moment: shows `text` now and returns the function that turns the same toast into the result. */
export function pending(text: string): (kind: NoteKind, result: string) => void {
  const id = toast.loading(text);
  return (kind, result) => { toast.update(id, { type: kind, title: result, duration: kind === "error" ? 0 : readFor(result) }); };
}
