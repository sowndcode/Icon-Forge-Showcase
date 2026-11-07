// Small local log: data/logs/main.log, rotated at 1 MB (main.1.log … main.3.log), nothing older than 30 days.
// The app folder, home folder and user name are hidden and long data is cut, so logs carry no personal details.
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const MAX_BYTES = 1_000_000;
const KEEP = 3;
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

let dir = null;
let file = null;
let written = 0;

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pathRe = (p) => new RegExp(escapeRe(p).replace(/\\\\/g, '[\\\\/]'), 'gi');

const home = os.homedir();
const homeRe = home ? pathRe(home) : null;
let userRe = null;
try {
  const user = os.userInfo().username;
  // very short names would also match ordinary words
  if (user.length >= 3) userRe = new RegExp(`(?<!\\w)${escapeRe(user)}(?!\\w)`, 'gi');
} catch {
  /* no user name available: nothing to hide */
}
let appRe = null;

function redact(msg) {
  let s = String(msg);
  if (appRe) s = s.replace(appRe, '<app>');
  if (homeRe) s = s.replace(homeRe, '~');
  if (userRe) s = s.replace(userRe, '<user>');
  s = s.replace(/data:[\w/+.-]+;base64,[A-Za-z0-9+/=]{40,}/g, 'data:…');
  return s.length > 4000 ? s.slice(0, 4000) + '…' : s;
}

function rotate() {
  try {
    for (let i = KEEP - 1; i >= 1; i--) {
      const from = path.join(dir, `main.${i}.log`);
      if (fs.existsSync(from)) fs.renameSync(from, path.join(dir, `main.${i + 1}.log`));
    }
    if (fs.existsSync(file)) fs.renameSync(file, path.join(dir, 'main.1.log'));
  } catch {
    /* a log that can't rotate keeps growing a little — not worth failing over */
  }
  written = 0;
}

function cleanup() {
  try {
    const now = Date.now();
    for (const name of fs.readdirSync(dir)) {
      const m = /^main\.(\d+)\.log$/.exec(name);
      const p = path.join(dir, name);
      if ((m && Number(m[1]) > KEEP) || (/\.log$/.test(name) && now - fs.statSync(p).mtimeMs > MAX_AGE_MS)) fs.unlinkSync(p);
    }
  } catch {
    /* not critical */
  }
}

function init(logDir) {
  dir = logDir;
  file = path.join(dir, 'main.log');
  // logs live in <app folder>/data/logs
  appRe = pathRe(path.resolve(dir, '..', '..'));
  try {
    fs.mkdirSync(dir, { recursive: true });
    written = fs.existsSync(file) ? fs.statSync(file).size : 0;
    if (written > MAX_BYTES) rotate();
  } catch {
    file = null;
  }
  cleanup();
}

function write(level, scope, ...parts) {
  const msg = parts.map((p) => (p instanceof Error ? p.stack || p.message : typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${redact(msg)}\n`;
  if (level === 'error' || level === 'warn') process.stderr.write(line);
  if (!file) return;
  try {
    if (written + line.length > MAX_BYTES) rotate();
    fs.appendFileSync(file, line);
    written += line.length;
  } catch {
    /* logging must never break the app */
  }
}

const log = {
  init,
  redact,
  info: (scope, ...p) => write('info', scope, ...p),
  warn: (scope, ...p) => write('warn', scope, ...p),
  error: (scope, ...p) => write('error', scope, ...p),
};

module.exports = log;
