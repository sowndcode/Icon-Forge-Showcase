/** "C:\Users\me\Apps\Icon Forge\data" shortened in the middle, keeping the drive and the last folders. */
export function middleTruncate(path: string, max = 52): string {
  if (path.length <= max) return path;
  const sep = path.includes('\\') ? '\\' : '/';
  const parts = path.split(sep);
  const head = parts[0] + sep;
  let tail = parts[parts.length - 1];
  for (let i = parts.length - 2; i > 0; i--) {
    const next = parts[i] + sep + tail;
    if (head.length + next.length + 2 > max) break;
    tail = next;
  }
  if (head.length + tail.length + 2 > max) tail = '…' + tail.slice(-(max - head.length - 2));
  return `${head}…${sep}${tail}`;
}

