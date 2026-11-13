#!/usr/bin/env node
// Peonie — the open-source cyber model.
// Runs Claude Code / Codex / CAI against local, security-tuned open-weight
// models served by Ollama. No tokens, no credits, no cloud.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir, platform } from 'node:os';
import process from 'node:process';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const IS_WIN = platform() === 'win32';
const OLLAMA_HOST = process.env.PEONIE_OLLAMA_HOST || 'http://localhost:11434';

// ---- Peonie model catalog ---------------------------------------------------
// Each profile maps a short name -> the custom Ollama model `peonie setup` builds,
// its upstream base, and the context window to advertise to the agent.
const MODELS = {
  code:  { tag: 'peonie-code',  base: 'qwen3-coder:30b',                                              ctx: 262144, blurb: 'Agentic driver (Qwen3-Coder 30B, strong tool-calling). Default.' },
  cyber: { tag: 'peonie-cyber', base: 'hf.co/mradermacher/DeepHat-V1-7B-GGUF:Q4_K_M',                 ctx: 32768,  blurb: 'Security specialist (DeepHat V1 7B, offensive/defensive cyber).' },
  sec:   { tag: 'peonie-sec',   base: 'hf.co/fdtn-ai/Foundation-Sec-8B-Reasoning-Q4_K_M-GGUF:latest', ctx: 16384,  blurb: 'Threat-intel reasoner (Cisco Foundation-Sec-8B).' },
};
const DEFAULT_PROFILE = 'code';

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  pink: '\x1b[38;5;211m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const paint = (s, c) => (process.stdout.isTTY ? c + s + C.reset : s);
const log = (...a) => console.error(...a);
const die = (msg) => { log(paint('peonie: ' + msg, C.red)); process.exit(1); };

const BANNER = `${C.pink}${C.bold}
   ██████╗ ███████╗ ██████╗ ███╗   ██╗██╗███████╗
   ██╔══██╗██╔════╝██╔═══██╗████╗  ██║██║██╔════╝
   ██████╔╝█████╗  ██║   ██║██╔██╗ ██║██║█████╗
   ██╔═══╝ ██╔══╝  ██║   ██║██║╚██╗██║██║██╔══╝
   ██║     ███████╗╚██████╔╝██║ ╚████║██║███████╗
   ╚═╝     ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝╚══════╝${C.reset}
   ${C.dim}the open-source cyber model · local · no tokens${C.reset}
`;

// ---- small helpers ----------------------------------------------------------
function which(cmd) {
  const probe = IS_WIN ? 'where' : 'which';
  const r = spawnSync(probe, [cmd], { encoding: 'utf8' });
  if (r.status === 0) return r.stdout.split(/\r?\n/).find(Boolean);
  return null;
}

function findExe(name, fallbacks) {
  const onPath = which(name);
  if (onPath) return onPath;
  for (const f of fallbacks) if (f && existsSync(f)) return f;
  return null;
}

function ollamaBin() {
  return findExe('ollama', [
    join(homedir(), 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe'),
    'C:/Program Files/Ollama/ollama.exe',
    '/usr/local/bin/ollama', '/usr/bin/ollama', join(homedir(), '.local', 'bin', 'ollama'),
  ]);
}

function claudeBin() {
  return findExe('claude', [
    join(homedir(), '.local', 'bin', IS_WIN ? 'claude.exe' : 'claude'),
    join(homedir(), '.local', 'bin', 'claude'),
  ]);
}

function codexBin() {
  return findExe('codex', [join(homedir(), '.local', 'bin', IS_WIN ? 'codex.exe' : 'codex')]);
}

function httpGet(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
  });
}

async function serverUp() {
  const r = await httpGet(OLLAMA_HOST + '/api/version');
  return !!(r && r.status === 200);
}

async function ensureServer() {
  if (await serverUp()) return;
  const ol = ollamaBin();
  if (!ol) die('Ollama is not installed. Install it first:\n  winget install Ollama.Ollama   (Windows)\n  curl -fsSL https://ollama.com/install.sh | sh   (Linux)');
  log(paint('Starting Ollama…', C.dim));
  const child = spawn(ol, ['serve'], { detached: true, stdio: 'ignore' });
  child.unref();
  for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 500)); if (await serverUp()) return; }
  die('Ollama did not come up on ' + OLLAMA_HOST);
}

async function listLocalModels() {
  const r = await httpGet(OLLAMA_HOST + '/api/tags');
  if (!r || r.status !== 200) return [];
  try { return (JSON.parse(r.body).models || []).map((m) => m.name); } catch { return []; }
}

// Ollama reports names with a tag suffix (e.g. "peonie-code:latest").
// Match either the bare name or the base before the ":".
function hasModel(list, tag) {
  return list.some((n) => n === tag || n === tag + ':latest' || n.split(':')[0] === tag);
}

function resolveProfile(args) {
  // --model <code|cyber|sec|rawOllamaName> ; also accept PEONIE_MODEL env
  let name = process.env.PEONIE_MODEL || DEFAULT_PROFILE;
  const i = args.findIndex((a) => a === '--model' || a === '-m');
  let passthrough = args;
  if (i !== -1 && args[i + 1]) { name = args[i + 1]; passthrough = args.slice(0, i).concat(args.slice(i + 2)); }
  const prof = MODELS[name];
  if (prof) return { tag: prof.tag, ctx: prof.ctx, passthrough };
  // allow an arbitrary local ollama model name
  return { tag: name, ctx: 32768, passthrough };
}

function run(bin, argv, extraEnv) {
  const child = spawn(bin, argv, { stdio: 'inherit', env: { ...process.env, ...extraEnv }, shell: false });
  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', (e) => die('failed to launch ' + bin + ': ' + e.message));
}

// ---- commands ---------------------------------------------------------------
async function cmdClaude(args) {
  const claude = claudeBin();
  if (!claude) die('Claude Code is not installed.\n  irm https://claude.ai/install.ps1 | iex   (Windows)\n  curl -fsSL https://claude.ai/install.sh | bash   (Linux/macOS)');
  await ensureServer();
  const { tag, ctx, passthrough } = resolveProfile(args);
  const local = await listLocalModels();
  const isPeonieModel = Object.keys(MODELS).some((k) => MODELS[k].tag === tag);
  if (!hasModel(local, tag) && isPeonieModel) {
    log(paint(`Model "${tag}" is not built yet. Run:  peonie setup`, C.yellow));
  }
  const env = {
    ANTHROPIC_BASE_URL: OLLAMA_HOST,
    ANTHROPIC_AUTH_TOKEN: 'peonie',
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_MODEL: tag,
    ANTHROPIC_DEFAULT_OPUS_MODEL: tag,
    ANTHROPIC_DEFAULT_SONNET_MODEL: tag,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: tag,
    ANTHROPIC_SMALL_FAST_MODEL: tag,
    CLAUDE_CODE_MAX_CONTEXT_TOKENS: String(ctx),
    CLAUDE_CODE_AUTO_MODE_SERVER: '0',
  };
  log(paint(`Peonie → Claude Code  ·  model ${tag}  ·  ${OLLAMA_HOST}`, C.pink));
  run(claude, passthrough, env);
}

async function cmdCodex(args) {
  const codex = codexBin();
  if (!codex) die('Codex CLI is not installed.  npm i -g @openai/codex');
  await ensureServer();
  const { tag, passthrough } = resolveProfile(args);
  // Codex speaks OpenAI-compatible; Ollama exposes /v1
  const env = {
    OPENAI_BASE_URL: OLLAMA_HOST + '/v1',
    OPENAI_API_KEY: 'peonie',
  };
  log(paint(`Peonie → Codex  ·  model ${tag}  ·  ${OLLAMA_HOST}/v1`, C.pink));
  run(codex, ['--model', tag, ...passthrough], env);
}

async function cmdCai(args) {
  await ensureServer();
  const { tag, passthrough } = resolveProfile(args);
  const cai = findExe('cai', []);
  const env = {
    OLLAMA_API_BASE: OLLAMA_HOST,
    OPENAI_BASE_URL: OLLAMA_HOST + '/v1',
    OPENAI_API_KEY: 'peonie',
    CAI_MODEL: 'ollama/' + tag,
  };
  log(paint(`Peonie → CAI  ·  model ollama/${tag}`, C.pink));
  if (cai) return run(cai, passthrough, env);
  // fall back to module invocation
  const py = findExe('python', [findExe('py', [])]);
  if (!py) die('CAI is not installed.  pip install cai-framework');
  run(py, ['-m', 'cai', ...passthrough], env);
}

async function cmdScan(args) {
  const target = args[0];
  if (!target) die('usage: peonie scan <path-to-binary-or-dir> [--sbom]');
  const trivy = findExe('trivy', []);
  const cvebin = findExe('cve-bin-tool', []);
  const syft = findExe('syft', []);
  let ran = false;
  if (cvebin) { ran = true; log(paint('• cve-bin-tool', C.cyan)); spawnSync(cvebin, [target], { stdio: 'inherit' }); }
  if (trivy) { ran = true; log(paint('• trivy fs', C.cyan)); spawnSync(trivy, ['fs', '--scanners', 'vuln', target], { stdio: 'inherit' }); }
  if (args.includes('--sbom') && syft) { log(paint('• syft sbom (cyclonedx)', C.cyan)); spawnSync(syft, [target, '-o', 'cyclonedx-json=peonie-sbom.json'], { stdio: 'inherit' }); }
  if (!ran) die('No scanner found. Install at least one:\n  pip install cve-bin-tool\n  winget install AquaSecurity.Trivy   (or scoop/brew install trivy)\n  (syft/grype from anchore for SBOMs)');
}

function cmdDoctor() {
  const rows = [
    ['ollama', ollamaBin()],
    ['claude', claudeBin()],
    ['codex', codexBin()],
    ['cai', findExe('cai', [])],
    ['trivy', findExe('trivy', [])],
    ['cve-bin-tool', findExe('cve-bin-tool', [])],
    ['syft', findExe('syft', [])],
    ['grype', findExe('grype', [])],
  ];
  console.log(BANNER);
  for (const [n, p] of rows) {
    const ok = !!p;
    console.log(`  ${ok ? paint('✓', C.green) : paint('✗', C.red)} ${n.padEnd(14)} ${paint(p || 'not found', ok ? C.dim : C.yellow)}`);
  }
  serverUp().then((up) => {
    console.log(`  ${up ? paint('✓', C.green) : paint('✗', C.red)} ollama server  ${paint(up ? OLLAMA_HOST : 'down (run: peonie serve)', up ? C.dim : C.yellow)}`);
    listLocalModels().then((m) => {
      console.log('\n  ' + paint('Peonie models:', C.bold));
      for (const k of Object.keys(MODELS)) {
        const built = hasModel(m, MODELS[k].tag);
        console.log(`    ${built ? paint('✓', C.green) : paint('·', C.yellow)} ${k.padEnd(6)} ${MODELS[k].tag.padEnd(14)} ${paint(MODELS[k].blurb, C.dim)}`);
      }
      if (!Object.keys(MODELS).some((k) => hasModel(m, MODELS[k].tag))) console.log('\n  ' + paint('Run  peonie setup  to pull bases and build the Peonie models.', C.yellow));
    });
  });
}

async function cmdServe() {
  await ensureServer();
  log(paint('Ollama is up on ' + OLLAMA_HOST, C.green));
}

function cmdModels() {
  console.log(BANNER);
  for (const k of Object.keys(MODELS)) {
    const m = MODELS[k];
    console.log(`  ${paint(k.padEnd(6), C.pink)} ${paint(m.tag, C.bold)}  ${paint('ctx ' + m.ctx, C.dim)}\n         base: ${paint(m.base, C.dim)}\n         ${m.blurb}\n`);
  }
}

function cmdSetup(args) {
  // Delegates to the platform setup script which pulls bases and builds models.
  const script = IS_WIN ? join(ROOT, 'install.ps1') : join(ROOT, 'install.sh');
  log(paint('Building Peonie models (pulls bases on first run)…', C.pink));
  if (IS_WIN) {
    run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, 'models', ...args], {});
  } else {
    run('bash', [script, 'models', ...args], {});
  }
}

function help() {
  console.log(BANNER);
  console.log(`  ${paint('Usage:', C.bold)} peonie <command> [--model code|cyber|sec] [args…]

  ${paint('peonie claude', C.pink)} [args]   Launch Claude Code on a local Peonie model
  ${paint('peonie codex', C.pink)}  [args]   Launch Codex CLI on a local Peonie model
  ${paint('peonie cai', C.pink)}    [args]   Launch CAI (Cybersecurity AI) on a local model
  ${paint('peonie scan', C.pink)} <path>     CVE-scan a binary/dir (cve-bin-tool + trivy) [--sbom]
  ${paint('peonie setup', C.pink)}           Pull model bases and build the Peonie models
  ${paint('peonie models', C.pink)}          Show the Peonie model catalog
  ${paint('peonie serve', C.pink)}           Ensure the local Ollama server is running
  ${paint('peonie doctor', C.pink)}          Check installed tools, server and models

  ${paint('Profiles:', C.bold)}  code (default, agentic) · cyber (DeepHat) · sec (Foundation-Sec)
  ${paint('Example:', C.bold)}   peonie claude --model cyber
`);
}

// ---- dispatch ---------------------------------------------------------------
const [cmd, ...rest] = process.argv.slice(2);
(async () => {
  switch (cmd) {
    case 'claude': return cmdClaude(rest);
    case 'codex': return cmdCodex(rest);
    case 'cai': return cmdCai(rest);
    case 'scan': return cmdScan(rest);
    case 'setup': return cmdSetup(rest);
    case 'models': return cmdModels();
    case 'serve': return cmdServe();
    case 'doctor': return cmdDoctor();
    case '-v': case '--version': return console.log('peonie 0.1.0');
    case undefined: case '-h': case '--help': case 'help': return help();
    default: die(`unknown command "${cmd}". Run  peonie --help`);
  }
})();
