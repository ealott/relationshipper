/** Words in something written, counted the way the composer counts them. */
export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
