const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const stateFile = path.join(dataDir, "todo-manager-state.json");
const port = Number(process.env.PORT) || 8000;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const defaultState = {
  version: 1,
  updatedAt: "",
  settings: {
    theme: "light",
    filter: "all",
    activeWeekStart: "",
    sidebarCollapsed: false,
    expandedDays: {}
  },
  months: {},
  drafts: {
    taskInput: "",
    summary: ""
  },
  history: []
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/state" && req.method === "GET") {
      await sendState(res);
      return;
    }

    if (req.url === "/api/state" && req.method === "POST") {
      await saveState(req, res);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, "Method not allowed", "text/plain; charset=utf-8");
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    send(res, 500, JSON.stringify({ error: "Server error" }), "application/json; charset=utf-8");
  }
});

server.listen(port, () => {
  console.log(`AI Daily Manager running at http://localhost:${port}`);
});

async function sendState(res) {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    const raw = await fs.readFile(stateFile, "utf8");
    send(res, 200, raw, "application/json; charset=utf-8");
  } catch (error) {
    send(res, 200, JSON.stringify(defaultState, null, 2), "application/json; charset=utf-8");
  }
}

async function saveState(req, res) {
  const body = await readBody(req);
  const state = normalizeState(JSON.parse(body || "{}"));

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2) + "\n");

  await removeStaleMonthFiles(Object.keys(state.months));

  await Promise.all(
    Object.keys(state.months).map((monthKey) => {
      const monthFile = path.join(dataDir, `${monthKey}.json`);
      const monthState = {
        version: state.version,
        updatedAt: state.updatedAt,
        month: monthKey,
        tasks: state.months[monthKey].tasks || []
      };
      return fs.writeFile(monthFile, JSON.stringify(monthState, null, 2) + "\n");
    })
  );

  send(res, 200, JSON.stringify({ ok: true }), "application/json; charset=utf-8");
}

async function removeStaleMonthFiles(activeMonths) {
  const active = new Set(activeMonths.map(String));
  const entries = await fs.readdir(dataDir, { withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /^\d{4}-\d{2}\.json$/.test(entry.name))
      .filter((entry) => !active.has(entry.name.slice(0, 7)))
      .map((entry) => fs.unlink(path.join(dataDir, entry.name)))
  );
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${port}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(rootDir, requestedPath));

  if (!filePath.startsWith(rootDir)) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const contentType = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    send(res, 200, content, contentType);
  } catch (error) {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
}

function normalizeState(input) {
  const source = input && typeof input === "object" ? input : {};
  const months = source.months && typeof source.months === "object" ? source.months : {};

  return {
    version: Number(source.version) || 1,
    updatedAt: source.updatedAt || new Date().toISOString(),
    settings: Object.assign({}, defaultState.settings, source.settings || {}),
    months,
    drafts: Object.assign({}, defaultState.drafts, source.drafts || {}),
    history: Array.isArray(source.history) ? source.history : []
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        req.destroy();
        reject(new Error("Request too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function send(res, statusCode, body, contentType) {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  res.end(body);
}
