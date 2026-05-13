/* ------------------------------------------------------------------
   In-memory ring buffer that captures all server console output.
   Used to expose recent logs over HTTP without needing access to the
   Replit deployment Logs tab.

   Wires into console.log/info/warn/error at boot. Keeps the most recent
   BUFFER_SIZE lines. Older entries are dropped silently.

   Read access: server/routes/admin-evolution.ts exposes
     GET /api/admin/logs/recent?limit=200&format=text
   (X-API-Key protected via PRICE_STATS_KEY).
   ------------------------------------------------------------------*/

const BUFFER_SIZE = 5000;
const buffer: { ts: string; level: string; line: string }[] = [];

let installed = false;

function fmt(args: any[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

function push(level: string, args: any[]) {
  buffer.push({ ts: new Date().toISOString(), level, line: fmt(args) });
  if (buffer.length > BUFFER_SIZE) buffer.shift();
}

export function installLogBuffer() {
  if (installed) return;
  installed = true;
  const origLog = console.log;
  const origInfo = console.info;
  const origWarn = console.warn;
  const origErr = console.error;
  console.log = (...a: any[]) => {
    push("info", a);
    origLog.apply(console, a);
  };
  console.info = (...a: any[]) => {
    push("info", a);
    origInfo.apply(console, a);
  };
  console.warn = (...a: any[]) => {
    push("warn", a);
    origWarn.apply(console, a);
  };
  console.error = (...a: any[]) => {
    push("error", a);
    origErr.apply(console, a);
  };
  push("info", ["[log-buffer] installed, capturing console output"]);
}

export function getRecentLogs(
  limit = 200,
  opts?: { since?: string; level?: "error" | "warn" | "info"; pattern?: string },
) {
  let out = buffer;
  if (opts?.since) {
    out = out.filter((l) => l.ts > opts.since!);
  }
  if (opts?.level) {
    const order = { error: 3, warn: 2, info: 1 };
    const min = order[opts.level];
    out = out.filter((l) => (order[l.level as keyof typeof order] ?? 1) >= min);
  }
  if (opts?.pattern) {
    try {
      const re = new RegExp(opts.pattern, "i");
      out = out.filter((l) => re.test(l.line));
    } catch {
      // bad regex, skip filter
    }
  }
  return out.slice(-limit);
}
