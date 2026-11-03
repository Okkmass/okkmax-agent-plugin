// Validates this repository using only its own files and public URLs. No secrets are used.
// Usage: node .github/scripts/validate.mjs [--offline]   (--offline skips every network check)
// Needs ajv@8 (CI installs it); set AJV_PATH to an absolute path of ajv/dist/2020.js to use another copy.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const offline = process.argv.includes("--offline");
const errors = [];
const fail = (m) => errors.push(m);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const json = (rel) => {
  try { return JSON.parse(read(rel)); } catch (e) { fail(`${rel}: not valid JSON (${e.message})`); return null; }
};

const SELF = ".github/scripts/validate.mjs";
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    const rel = path.relative(root, full).split(path.sep).join("/");
    if (fs.lstatSync(full).isSymbolicLink()) { fail(`${rel}: symbolic links are not allowed`); continue; }
    if (e.isDirectory()) walk(full); else files.push(rel);
  }
})(root);

// 1. JSON parses, manifests agree with each other
const openai = json("plugin.json");
const mcp = json("mcp.json");
const claude = json(".claude-plugin/plugin.json");
const market = json(".claude-plugin/marketplace.json");
const MCP_URL = mcp?.mcpServers?.okkmax?.url;
if (mcp) {
  if (Object.keys(mcp.mcpServers ?? {}).join() !== "okkmax") fail("mcp.json: expected exactly one server named okkmax");
  if (mcp.mcpServers?.okkmax?.type !== "streamable-http") fail("mcp.json: okkmax must be streamable-http");
  if (!/^https:\/\/www\.okkmax\.com\/mcp$/.test(MCP_URL ?? "")) fail(`mcp.json: unexpected MCP URL ${MCP_URL}`);
}
if (claude) {
  const c = claude.mcpServers?.okkmax;
  if (c?.type !== "http" || c?.url !== MCP_URL) fail(".claude-plugin/plugin.json: mcpServers.okkmax must be type http with the same URL as mcp.json");
  if (Object.keys(claude.mcpServers ?? {}).join() !== "okkmax") fail(".claude-plugin/plugin.json: expected exactly one MCP server");
}
if (openai && claude) {
  for (const k of ["name", "version", "description"]) if (openai[k] !== claude[k]) fail(`plugin.json and .claude-plugin/plugin.json disagree on ${k}`);
  if (market?.plugins?.[0]?.version !== openai.version) fail("marketplace.json version differs from plugin.json");
  if (market?.plugins?.[0]?.name !== openai.name) fail("marketplace.json name differs from plugin.json");
}
if (openai && !/^MIT$/.test(openai.license ?? "")) fail("plugin.json: license must be MIT");
if (!files.includes("LICENSE") || !/^MIT License/.test(read("LICENSE"))) fail("LICENSE: MIT license file missing");
for (const f of ["README.md", "SECURITY.md", "CHANGELOG.md", "assets/icon.png"]) if (!files.includes(f)) fail(`${f}: missing`);
const lifecycle = files.filter((f) => /(^|\/)(hooks|agents|commands)(\/|\.json$)/.test(f));
if (lifecycle.length) fail(`unexpected hooks/agents/commands: ${lifecycle.join(", ")}`);
if (claude && (claude.hooks || claude.agents || claude.commands || claude.lspServers)) fail(".claude-plugin/plugin.json: hooks, agents, commands and LSP are not part of this release");

// 2. Skills: exactly two, one copy each, names match directories, nothing else carries a SKILL.md
const skillFiles = files.filter((f) => /(^|\/)SKILL\.md$/.test(f)).sort();
const expected = ["skills/okkmax-check-relay/SKILL.md", "skills/okkmax-find-relay/SKILL.md"];
if (skillFiles.join() !== expected.join()) fail(`SKILL.md files must be exactly ${expected.join(", ")}; found ${skillFiles.join(", ")}`);
const hashes = new Map();
const TOOLS = ["search_stations", "search_models", "get_model_board", "find_cheapest_relay", "get_station", "explain_methodology"];
for (const f of skillFiles) {
  const text = read(f);
  const dir = f.split("/")[1];
  const name = /^---\n(?:[\s\S]*?\n)?name:\s*(\S+)[ \t]*\n[\s\S]*?\n---/.exec(text)?.[1];
  if (name !== dir) fail(`${f}: front-matter name "${name}" must equal directory "${dir}"`);
  const h = createHash("sha256").update(text).digest("hex");
  if (hashes.has(h)) fail(`${f} duplicates ${hashes.get(h)}`);
  hashes.set(h, f);
  for (const t of text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)) if (/^(search|get|find|explain)_/.test(t[1]) && !TOOLS.includes(t[1])) fail(`${f}: mentions unknown tool ${t[1]}`);
  if (!read("README.md").includes(`\`${dir}\``)) fail(`README.md does not mention ${dir}`);
}
for (const t of TOOLS) if (!read("README.md").includes(`\`${t}\``)) fail(`README.md does not list tool ${t}`);

// 3. Forbidden files and content
const FORBIDDEN_FILE = /(^|\/)(\.env(\..*)?|\.DS_Store|.*\.(db|sqlite|zip|log|pem|key)|id_rsa.*|docker-compose.*|Caddyfile|node_modules)$/i;
for (const f of files) if (FORBIDDEN_FILE.test(f)) fail(`${f}: must not be committed`);
const TEXT = /\.(json|md|mjs|yml|yaml|txt)$|(^|\/)(LICENSE|\.gitignore)$/;
const PATTERNS = [
  [/sk-[A-Za-z0-9_-]{16,}/, "API key shaped string"],
  [/gh[pousr]_[A-Za-z0-9]{20,}/, "GitHub token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/postgres(ql)?:\/\//i, "database URL"],
  [/DATABASE_URL/, "DATABASE_URL"],
  [/\/opt\/okkmax|\/Users\/[a-z0-9_.-]+/i, "private filesystem path"],
  [/\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/, "internal IP address"],
  [/(?:^|[^a-z])bearer\s+[A-Za-z0-9._~+/-]{20,}/i, "bearer token"],
  [/authorization\s*[:=]\s*["']?[A-Za-z]+\s+[A-Za-z0-9._~+/-]{16,}/i, "authorization header value"],
  [/[?&](?:ref|invite|aff|referral)=/i, "referral link"],
];
for (const f of files) {
  if (f === SELF || !TEXT.test(f)) continue;
  const text = read(f);
  for (const [re, label] of PATTERNS) if (re.test(text)) fail(`${f}: contains ${label}`);
}
const png = fs.readFileSync(path.join(root, "assets/icon.png"));
if (png.subarray(1, 4).toString() !== "PNG") fail("assets/icon.png: not a PNG");
else {
  if (png.readUInt32BE(16) !== png.readUInt32BE(20)) fail("assets/icon.png: not square");
  for (let i = 8; i < png.length; ) {
    const len = png.readUInt32BE(i), type = png.subarray(i + 4, i + 8).toString();
    if (["tEXt", "iTXt", "zTXt", "eXIf", "tIME"].includes(type)) fail(`assets/icon.png: metadata chunk ${type}`);
    i += 12 + len;
  }
}

// 4. Public URLs: schemas, MCP endpoint, documentation links
async function get(url, init, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
      if (r.status < 500 && r.status !== 429) return r;
      last = new Error(`HTTP ${r.status}`);
    } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  throw last;
}

if (!offline) {
  const ajvPath = process.env.AJV_PATH ? (await import("node:url")).pathToFileURL(process.env.AJV_PATH).href : "ajv/dist/2020.js";
  const { default: Ajv2020 } = await import(ajvPath);
  for (const [name, data] of [["plugin.json", openai], ["mcp.json", mcp]]) {
    if (!data) continue;
    try {
      const schema = await (await get(data.$schema)).json();
      const ajv = new Ajv2020({ strict: false, allErrors: true });
      if (!ajv.validate(schema, data)) fail(`${name}: fails ${data.$schema}: ${ajv.errorsText(ajv.errors)}`);
    } catch (e) { fail(`${name}: could not fetch or run schema ${data.$schema} (${e.message})`); }
  }
  try {
    const r = await get(MCP_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "okkmax-agent-plugin-ci", version: "1" } } }),
    });
    const body = await r.text();
    if (r.status !== 200 || !body.includes("serverInfo")) fail(`MCP initialize failed: HTTP ${r.status}`);
  } catch (e) { fail(`MCP endpoint unreachable: ${e.message}`); }
  const urls = new Set();
  for (const f of ["README.md", "plugin.json", ".claude-plugin/plugin.json"]) for (const m of read(f).matchAll(/https:\/\/www\.okkmax\.com[^\s"'`)<>]*/g)) urls.add(m[0].replace(/[.,]$/, ""));
  urls.delete(MCP_URL);
  for (const u of [...urls]) if (u.includes("$n")) { urls.delete(u); for (const f of skillFiles) urls.add(u.replace("$n", f.split("/")[1])); }
  for (const u of urls) {
    try { const r = await get(u); if (r.status !== 200) fail(`${u}: HTTP ${r.status}`); } catch (e) { fail(`${u}: ${e.message}`); }
  }
}

if (errors.length) {
  console.error(`Validation failed (${errors.length}):\n` + errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}
console.log(`Validation passed${offline ? " (offline)" : ""}: ${files.length} files`);
