<div align="center">

<img src="./assets/banner.svg" alt="Peonie, the open-source cyber model" width="100%" />

<br/>

<a href="#install"><img src="https://img.shields.io/badge/install-30s-ff6ec7?style=for-the-badge&labelColor=1c0e2e" alt="install"/></a>
<a href="#the-model"><img src="https://img.shields.io/badge/runs-local-8be28b?style=for-the-badge&labelColor=1c0e2e" alt="local"/></a>
<a href="#license"><img src="https://img.shields.io/badge/license-MIT-b57bff?style=for-the-badge&labelColor=1c0e2e" alt="MIT"/></a>

</div>

Peonie is one strong cyber model that runs on your own machine. You drive it with the coding agents you already use (Claude Code, Codex, and [CAI](https://github.com/aliasrobotics/CAI)), and it does defensive security work: reads code and binaries, finds vulnerabilities, maps them to CVE and CWE identifiers, writes a proof of concept so you can confirm a fix, and builds detections.

The point is that it costs nothing per request and nothing leaves the box. There is no API key, no credit balance, and no "out of credit" wall. After the first model download it works with the network off.

```
peonie claude   ->   local Ollama server   ->   peonie (one cyber model)

  you type a command            the model runs on your GPU and CPU
  no API key, no credits        your code never leaves the machine
```

## What it is

Peonie is a small launcher plus one Ollama model. The launcher points Claude Code, Codex, or CAI at your local Ollama server and tells them to use the `peonie` model. The model is built on Llama 3.1 8B, picked because it emits structured tool calls, fits entirely in an 8 GB GPU, and stays fast. A cyber-defense system prompt ships with it, so it behaves like a security engineer: it inspects, forms a hypothesis, and reports with evidence. If you have more VRAM, you can point it at a larger model (see below).

There is a single model on purpose. You run `peonie claude` and get to work. No model picker, no flags to remember.

## Install

You need [Node.js 18+](https://nodejs.org), a GPU with 8 GB of VRAM (or 16 GB of system RAM), and about 6 GB of free disk for the model.

Windows (PowerShell):

```powershell
git clone https://github.com/MAXIVA11/Peonie "$env:LOCALAPPDATA\Peonie"
cd "$env:LOCALAPPDATA\Peonie"
./install.ps1
```

Linux or macOS:

```bash
git clone https://github.com/MAXIVA11/Peonie ~/.local/share/Peonie
cd ~/.local/share/Peonie
./install.sh
```

The installer puts a `peonie` command on your PATH, installs Ollama if it is missing, pulls the base model, and builds the `peonie` model. Then:

```bash
peonie doctor     # check tools, server, and model
peonie claude     # start Claude Code on the local model
```

## Using it

```bash
peonie claude     # Claude Code on the Peonie model
peonie codex      # Codex CLI on the Peonie model
peonie cai        # CAI (Cybersecurity AI) on the Peonie model
```

Anything you type after the command passes straight through to the tool, so `peonie claude --help` reaches Claude Code and `peonie claude -p "..."` runs it in print mode.

A normal session looks like this: open `peonie claude` in the repo or build you are testing and ask it to find the vulnerabilities and write a PoC for the worst one. It reads the files, points at the line, explains the flaw with a CVE or CWE reference, and gives you a contained proof of concept and a fix.

| Command | What it does |
|---|---|
| `peonie claude [args]` | Launch Claude Code on the Peonie model |
| `peonie codex [args]` | Launch Codex CLI on the Peonie model |
| `peonie cai [args]` | Launch CAI on the Peonie model |
| `peonie scan <path>` | CVE-scan a binary or directory (`cve-bin-tool` + `trivy`), add `--sbom` for CycloneDX |
| `peonie setup` | Pull the base and build the Peonie model |
| `peonie update` | Pull the latest code and rebuild the model |
| `peonie router` | Set up or check the router that lets `peonie claude` run tools |
| `peonie serve` | Start the local Ollama server |
| `peonie doctor` | Check tools, server, and model |

## The model

| | |
|---|---|
| Name | `peonie` |
| Base | Llama 3.1 8B (fits an 8 GB GPU, structured tool calls) |
| Context | 16K tokens (sized to stay on the GPU) |
| Served by | [Ollama](https://ollama.com), locally |

The system prompt is in [`prompts/peonie-system.md`](./prompts/peonie-system.md) and the build recipe is in [`models/Modelfile`](./models/Modelfile). To trade speed for depth, change the `FROM` line to `qwen2.5-coder:14b` or `qwen3-coder:30b` and run `peonie setup` again, or point `PEONIE_MODEL` at any Ollama model you already have.

## CVE scanning

Peonie wraps a couple of offline scanners so you can check a build before it ships:

```bash
peonie scan ./build           # cve-bin-tool and trivy, known-CVE coverage
peonie scan ./build --sbom    # also writes peonie-sbom.json (CycloneDX)
```

Install the scanners once (`pip install cve-bin-tool`, `trivy` from your package manager, optional `syft` and `grype` from Anchore). Their databases download once and then run offline, so nothing gets uploaded.

## What it is good at, and where it is not

The default 8B is picked for speed on an 8 GB GPU. An 8B is a solid assistant for reading code, triaging known issues, mapping CVE and CWE, and writing PoCs. It will not independently discover new vulnerabilities in large third-party software the way a frontier model might. Treat it as a fast local helper, and bring in a bigger model or a hosted one for the hardest analysis.

`peonie claude` injects an authorized-security system prompt so the model does the work instead of refusing. It is for targets you own or are authorized to test. An 8B also follows instructions literally, so be explicit: "read net.py in full and analyze each function" gets a real audit, while a vague "audit this" may make it do a shallow search and miss things.

Tool use is the fiddly part. The model emits structured tool calls, but Claude Code reaches Ollama through its Anthropic endpoint, where those calls are not run reliably: the model may describe a tool instead of executing it. Peonie fixes this with a router. Install the classic claude-code-router once:

```bash
npm install -g @musistudio/claude-code-router@1
```

Then `peonie claude` detects it, writes its config, and routes through it so tools run. Run `peonie router` to check the status. The newer 3.x router has a different UI and profile design that Peonie does not drive, so install the `@1` line above. `peonie codex` and `peonie cai` use the OpenAI path and run tools without a router.

You can move the quality slider. Point the Modelfile at `qwen3-coder:30b` for stronger code reasoning and structured tools, at the cost of speed on an 8 GB GPU. For a larger context window, raise `num_ctx` (Llama 3.1 supports up to 128K) if you have the VRAM.

The scanners find known CVEs in third-party components, not new bugs in your own code, so pair them with the model and with fuzzing for real coverage.

Run Peonie only against systems you own or are authorized to test.

## License

The launcher is [MIT](./LICENSE). The model's base weights carry their own license, recorded in [`NOTICE.md`](./NOTICE.md) along with the tools Peonie orchestrates. You are responsible for meeting those terms and for using Peonie within your authorization.
