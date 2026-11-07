let counter = 0;

/** Short unique id (time + counter + random), safe for JSON keys and file names. */
export function uid(prefix = ''): string {
  counter = (counter + 1) % 1679616;
  return prefix + Date.now().toString(36) + counter.toString(36).padStart(4, '0') + Math.floor(Math.random() * 46656).toString(36).padStart(3, '0');
}
