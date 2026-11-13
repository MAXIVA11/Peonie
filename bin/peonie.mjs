#!/usr/bin/env node
// Peonie - the open-source cyber model.
// Runs Claude Code / Codex / CAI on a single local, security-tuned model
// served by Ollama. No tokens, no credits, no cloud.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir, platform } from 'node:os';
import process from 'node:process';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const IS_WIN = platform() === 'win32';
const OLLAMA_HOST = process.env.PEONIE_OLLAMA_HOST || 'http://localhost:11434';

// One unified model. Peonie is the cyber model; this is the only tag it serves.
// Override the Ollama tag with PEONIE_MODEL if you build your own.
const MODEL = process.env.PEONIE_MODEL || 'peonie';
const MODEL_BASE = 'llama3.1:8b';
const CTX = 16384;

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
   ${C.dim}the open-source cyber model . local . no tokens${C.reset}
`;

// ---- helpers ----------------------------------------------------------------
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

// claude-code-router: routes Claude Code through Ollama's OpenAI-compatible
// endpoint, where local models emit structured tool calls that actually run.
function ccrBin() {
  const npmBin = join(homedir(), 'AppData', 'Roaming', 'npm');
  // Prefer the .cmd shim on Windows so it can actually be launched.
  if (IS_WIN) { const c = join(npmBin, 'ccr.cmd'); if (existsSync(c)) return c; }
  return findExe('ccr', [
    join(npmBin, IS_WIN ? 'ccr.cmd' : 'ccr'),
    '/usr/local/bin/ccr', join(homedir(), '.local', 'bin', 'ccr'),
  ]);
}

// Peonie targets the classic claude-code-router (the `ccr code` + config.json
// design). Version 3.x replaced that with a web UI, SQLite config and named
// profiles, which this simple integration does not drive. Detect the classic
// one by its help text so Peonie never launches an incompatible ccr.
function ccrUsable(ccr) {
  try {
    let bin = ccr, argv = ['--help'];
    if (IS_WIN && /\.cmd$/i.test(ccr)) { bin = process.env.ComSpec || 'cmd.exe'; argv = ['/c', ccr, '--help']; }
    const r = spawnSync(bin, argv, { encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    return /\bcode\b/.test(out) && !/profile-name-or-id/i.test(out);
  } catch { return false; }
}

// Launch `ccr code <args>`. A .cmd shim on Windows must go through cmd.exe,
// but with an explicit argv (not shell:true) so prompts keep their quoting.
function runCcr(ccr, args, env) {
  let bin = ccr, argv = ['code', ...args];
  if (IS_WIN && /\.cmd$/i.test(ccr)) { bin = process.env.ComSpec || 'cmd.exe'; argv = ['/c', ccr, 'code', ...args]; }
  const child = spawn(bin, argv, { stdio: 'inherit', env: { ...process.env, ...env }, shell: false });
  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', (e) => die('failed to launch router: ' + e.message));
}

const CCR_CONFIG_DIR = join(homedir(), '.claude-code-router');
const CCR_CONFIG = join(CCR_CONFIG_DIR, 'config.json');

// The peonie provider for the router. The reasoning transformer with
// enable:false stops Claude Code's "thinking" from reaching the local model,
// which otherwise 400s because it does not support it.
function peonieProvider() {
  return {
    name: 'peonie',
    api_base_url: OLLAMA_HOST + '/v1/chat/completions',
    api_key: 'ollama',
    models: [MODEL],
    // The cerebras transformer strips the reasoning/thinking fields that Claude
    // Code sends and local Ollama models reject with "does not support thinking".
    transformer: { use: ['cerebras'] },
  };
}

// Ensure the router config points at the peonie model with the thinking-stripping
// transformer. Creates the config or updates our own provider in place, but never
// touches a config that is clearly the user's own. Returns true if it changed.
function ensureCcrConfig() {
  const want = peonieProvider();
  try {
    if (!existsSync(CCR_CONFIG)) {
      mkdirSync(CCR_CONFIG_DIR, { recursive: true });
      writeFileSync(CCR_CONFIG, JSON.stringify({ LOG: false, Providers: [want], Router: { default: `peonie,${MODEL}` } }, null, 2));
      return true;
    }
    const cfg = JSON.parse(readFileSync(CCR_CONFIG, 'utf8'));
    let changed = false;
    cfg.Providers = cfg.Providers || [];
    const prov = cfg.Providers.find((p) => p && p.name === 'peonie');
    if (!prov) return false; // respect a user's own config
    if (JSON.stringify(prov) !== JSON.stringify(want)) { Object.assign(prov, want); changed = true; }
    cfg.Router = cfg.Router || {};
    if (cfg.Router.default !== `peonie,${MODEL}`) { cfg.Router.default = `peonie,${MODEL}`; changed = true; }
    if (changed) writeFileSync(CCR_CONFIG, JSON.stringify(cfg, null, 2));
    return changed;
  } catch (e) {
    log(paint('could not write router config: ' + e.message, C.yellow));
    return false;
  }
}

function ccrStop(ccr) {
  try {
    let bin = ccr, argv = ['stop'];
    if (IS_WIN && /\.cmd$/i.test(ccr)) { bin = process.env.ComSpec || 'cmd.exe'; argv = ['/c', ccr, 'stop']; }
    spawnSync(bin, argv, { stdio: 'ignore' });
  } catch { /* ignore */ }
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
  log(paint('Starting Ollama...', C.dim));
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

// Ollama reports names with a tag suffix (e.g. "peonie:latest").
function hasModel(list, tag) {
  return list.some((n) => n === tag || n === tag + ':latest' || n.split(':')[0] === tag);
}

function run(bin, argv, extraEnv) {
  const child = spawn(bin, argv, { stdio: 'inherit', env: { ...process.env, ...extraEnv }, shell: false });
  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', (e) => die('failed to launch ' + bin + ': ' + e.message));
}

async function warnIfUnbuilt() {
  const local = await listLocalModels();
  if (!hasModel(local, MODEL)) log(paint(`Model "${MODEL}" is not built yet. Run:  peonie setup`, C.yellow));
}

// ---- commands ---------------------------------------------------------------
async function cmdClaude(args) {
  const claude = claudeBin();
  if (!claude) die('Claude Code is not installed.\n  irm https://claude.ai/install.ps1 | iex   (Windows)\n  curl -fsSL https://claude.ai/install.sh | bash   (Linux/macOS)');
  await ensureServer();
  await warnIfUnbuilt();

  // Preferred path: route through the classic claude-code-router so tool
  // calls execute. Only use it when the compatible version is installed.
  const foundCcr = process.env.PEONIE_NO_ROUTER ? null : ccrBin();
  if (foundCcr && ccrUsable(foundCcr)) {
    const wrote = ensureCcrConfig();
    if (wrote) {
      log(paint(`updated router config -> ${CCR_CONFIG}`, C.dim));
      ccrStop(foundCcr); // make the service reload the new config
    }
    log(paint(`Peonie on Claude Code via router . model ${MODEL}`, C.pink));
    // Local models like Llama 3.1 don't support "thinking"; Claude Code would
    // otherwise request it and the provider 400s. Turn it off.
    runCcr(foundCcr, args, { MAX_THINKING_TOKENS: '0', DISABLE_INTERLEAVED_THINKING: '1' });
    return;
  }

  // Fallback: talk to Ollama's Anthropic endpoint directly. Chat works, but
  // tool execution with local models is unreliable here.
  if (foundCcr) {
    log(paint('Found ccr, but it is the 3.x UI/profile build, which Peonie does not drive.', C.yellow));
    log(paint('Install the classic router instead:', C.yellow));
  } else {
    log(paint('Router (ccr) not found. Tool execution may be unreliable. Install once:', C.yellow));
  }
  log(paint('  npm install -g @musistudio/claude-code-router@1', C.cyan));
  const env = {
    ANTHROPIC_BASE_URL: OLLAMA_HOST,
    ANTHROPIC_AUTH_TOKEN: 'peonie',
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_MODEL: MODEL,
    ANTHROPIC_DEFAULT_OPUS_MODEL: MODEL,
    ANTHROPIC_DEFAULT_SONNET_MODEL: MODEL,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: MODEL,
    ANTHROPIC_SMALL_FAST_MODEL: MODEL,
    CLAUDE_CODE_MAX_CONTEXT_TOKENS: String(CTX),
    CLAUDE_CODE_AUTO_MODE_SERVER: '0',
  };
  log(paint(`Peonie on Claude Code . model ${MODEL} . ${OLLAMA_HOST}`, C.pink));
  run(claude, args, env);
}

async function cmdCodex(args) {
  const codex = codexBin();
  if (!codex) die('Codex CLI is not installed.  npm i -g @openai/codex');
  await ensureServer();
  await warnIfUnbuilt();
  const env = { OPENAI_BASE_URL: OLLAMA_HOST + '/v1', OPENAI_API_KEY: 'peonie' };
  log(paint(`Peonie on Codex . model ${MODEL} . ${OLLAMA_HOST}/v1`, C.pink));
  run(codex, ['--model', MODEL, ...args], env);
}

async function cmdCai(args) {
  await ensureServer();
  await warnIfUnbuilt();
  const env = {
    OLLAMA_API_BASE: OLLAMA_HOST,
    OPENAI_BASE_URL: OLLAMA_HOST + '/v1',
    OPENAI_API_KEY: 'peonie',
    CAI_MODEL: 'ollama/' + MODEL,
  };
  log(paint(`Peonie on CAI . model ollama/${MODEL}`, C.pink));
  const cai = findExe('cai', []);
  if (cai) return run(cai, args, env);
  const py = findExe('python', [findExe('py', [])]);
  if (!py) die('CAI is not installed.  pip install cai-framework');
  run(py, ['-m', 'cai', ...args], env);
}

async function cmdScan(args) {
  const target = args[0];
  if (!target) die('usage: peonie scan <path-to-binary-or-dir> [--sbom]');
  const trivy = findExe('trivy', []);
  const cvebin = findExe('cve-bin-tool', []);
  const syft = findExe('syft', []);
  let ran = false;
  if (cvebin) { ran = true; log(paint('running cve-bin-tool', C.cyan)); spawnSync(cvebin, [target], { stdio: 'inherit' }); }
  if (trivy) { ran = true; log(paint('running trivy fs', C.cyan)); spawnSync(trivy, ['fs', '--scanners', 'vuln', target], { stdio: 'inherit' }); }
  if (args.includes('--sbom') && syft) { log(paint('writing cyclonedx sbom', C.cyan)); spawnSync(syft, [target, '-o', 'cyclonedx-json=peonie-sbom.json'], { stdio: 'inherit' }); }
  if (!ran) die('No scanner found. Install at least one:\n  pip install cve-bin-tool\n  winget install AquaSecurity.Trivy\n  (syft/grype from anchore for SBOMs)');
}

function cmdDoctor() {
  const rows = [
    ['ollama', ollamaBin()],
    ['claude', claudeBin()],
    ['router (ccr)', ccrBin()],
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
    console.log(`  ${ok ? paint('ok ', C.green) : paint('-- ', C.red)} ${n.padEnd(14)} ${paint(p || 'not found', ok ? C.dim : C.yellow)}`);
  }
  serverUp().then((up) => {
    console.log(`  ${up ? paint('ok ', C.green) : paint('-- ', C.red)} ollama server  ${paint(up ? OLLAMA_HOST : 'down (run: peonie serve)', up ? C.dim : C.yellow)}`);
    listLocalModels().then((m) => {
      const built = hasModel(m, MODEL);
      console.log(`  ${built ? paint('ok ', C.green) : paint('-- ', C.yellow)} model ${MODEL}   ${paint(built ? 'built (base ' + MODEL_BASE + ')' : 'not built - run: peonie setup', built ? C.dim : C.yellow)}`);
    });
  });
}

async function cmdServe() {
  await ensureServer();
  log(paint('Ollama is up on ' + OLLAMA_HOST, C.green));
}

function cmdRouter() {
  console.log(BANNER);
  const ccr = ccrBin();
  if (ccr && ccrUsable(ccr)) {
    console.log(`  ${paint('ok', C.green)}  router installed (classic): ${paint(ccr, C.dim)}`);
    console.log(`  config: ${paint(CCR_CONFIG, C.dim)} ${existsSync(CCR_CONFIG) ? paint('(written)', C.green) : paint('(created on first run)', C.dim)}`);
    console.log(`\n  ${paint('peonie claude', C.pink)} routes through it, so tool calls execute.`);
  } else if (ccr) {
    console.log(`  ${paint('!', C.yellow)}  found ccr 3.x (UI/profile build): ${paint(ccr, C.dim)}`);
    console.log(`  Peonie drives the classic router. Replace it with:\n`);
    console.log(`    ${paint('npm install -g @musistudio/claude-code-router@1', C.cyan)}\n`);
    console.log(`  Then ${paint('peonie claude', C.pink)} picks it up automatically.`);
  } else {
    console.log(`  ${paint('The router makes Claude Code run tools with the local model.', C.bold)}`);
    console.log(`  Install it once:\n`);
    console.log(`    ${paint('npm install -g @musistudio/claude-code-router@1', C.cyan)}\n`);
    console.log(`  Then ${paint('peonie claude', C.pink)} picks it up automatically.`);
    console.log(`  ${paint('peonie codex', C.pink)} and ${paint('peonie cai', C.pink)} already run tools without it.`);
  }
}

async function cmdUpdate() {
  console.log(BANNER);
  const git = findExe('git', []);
  if (!git) die('git not found; install git to use peonie update.');
  log(paint('pulling the latest Peonie...', C.pink));
  const pull = spawnSync(git, ['-C', ROOT, 'pull', '--ff-only'], { stdio: 'inherit' });
  if (pull.status !== 0) {
    log(paint('git pull did not complete (local changes or no network). Fix and re-run.', C.yellow));
    return;
  }
  await ensureServer();
  const ol = ollamaBin();
  if (ol) {
    log(paint('rebuilding the peonie model...', C.pink));
    const build = spawnSync(ol, ['create', 'peonie', '-f', join(ROOT, 'models', 'Modelfile')], { stdio: 'inherit' });
    if (build.status === 0) log(paint('model rebuilt.', C.green));
    else log(paint('model rebuild failed; run: peonie setup', C.yellow));
  }
  log(paint('Peonie is up to date. Check it with:  peonie doctor', C.green));
}

function cmdSetup(args) {
  const script = IS_WIN ? join(ROOT, 'install.ps1') : join(ROOT, 'install.sh');
  log(paint('Building the Peonie model (pulls the base on first run)...', C.pink));
  if (IS_WIN) run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, 'model', ...args], {});
  else run('bash', [script, 'model', ...args], {});
}

function help() {
  console.log(BANNER);
  console.log(`  ${paint('Usage:', C.bold)} peonie <command> [args...]

  ${paint('peonie claude', C.pink)} [args]   Launch Claude Code on the Peonie model
  ${paint('peonie codex', C.pink)}  [args]   Launch Codex CLI on the Peonie model
  ${paint('peonie cai', C.pink)}    [args]   Launch CAI (Cybersecurity AI) on the Peonie model
  ${paint('peonie scan', C.pink)} <path>     CVE-scan a binary/dir (cve-bin-tool + trivy) [--sbom]
  ${paint('peonie setup', C.pink)}           Pull the base and build the Peonie model
  ${paint('peonie update', C.pink)}          Pull the latest code and rebuild the model
  ${paint('peonie router', C.pink)}          Set up / check the router that makes claude run tools
  ${paint('peonie serve', C.pink)}           Ensure the local Ollama server is running
  ${paint('peonie doctor', C.pink)}          Check installed tools, server and model

  One unified cyber model. Arguments after the command pass through to the tool.
  Example:  peonie claude   then ask it to find CVEs and write a PoC.
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
    case 'update': return cmdUpdate();
    case 'router': return cmdRouter();
    case 'serve': return cmdServe();
    case 'doctor': return cmdDoctor();
    case '-v': case '--version': return console.log('peonie 0.2.0');
    case undefined: case '-h': case '--help': case 'help': return help();
    default: die(`unknown command "${cmd}". Run  peonie --help`);
  }
})();
