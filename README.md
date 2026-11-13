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

Peonie is a small launcher plus one Ollama model. The launcher points Claude Code, Codex, or CAI at your local Ollama server and tells them to use the `peonie` model. The model is built on Qwen3-Coder 30B, which is good enough at tool use to actually carry out the work rather than only describe it. A cyber-defense system prompt ships with it, so out of the box it behaves like a security engineer: it inspects, forms a hypothesis, tests it, and reports with evidence.

There is a single model on purpose. You run `peonie claude` and get to work. No model picker, no flags to remember.

## Install

You need [Node.js 18+](https://nodejs.org), a GPU with 6 GB of VRAM or 16 GB of system RAM, and about 20 GB of free disk for the model.

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
| `peonie serve` | Start the local Ollama server |
| `peonie doctor` | Check tools, server, and model |

## The model

| | |
|---|---|
| Name | `peonie` |
| Base | Qwen3-Coder 30B (MoE, 3.3B active parameters) |
| Context | 32K tokens |
| Served by | [Ollama](https://ollama.com), locally |

The system prompt is in [`prompts/peonie-system.md`](./prompts/peonie-system.md) and the build recipe is in [`models/Modelfile`](./models/Modelfile). If you want a different base, edit the Modelfile and run `peonie setup` again, or point `PEONIE_MODEL` at any Ollama model you already have.

## CVE scanning

Peonie wraps a couple of offline scanners so you can check a build before it ships:

```bash
peonie scan ./build           # cve-bin-tool and trivy, known-CVE coverage
peonie scan ./build --sbom    # also writes peonie-sbom.json (CycloneDX)
```

Install the scanners once (`pip install cve-bin-tool`, `trivy` from your package manager, optional `syft` and `grype` from Anchore). Their databases download once and then run offline, so nothing gets uploaded.

## What it is good at, and where it is not

A 30B model that runs on a laptop GPU is strong, but it is not a frontier hosted model. It handles routine auditing, PoC writing, and CVE triage well. On the hardest reverse engineering or the most subtle logic bugs it will miss things a larger model would catch. Use it for volume, privacy, and offline work, and bring in a bigger model when you are stuck.

Two more things worth saying plainly. Speed depends on your hardware: on 8 GB of VRAM the model offloads part of itself to the CPU and runs slower, though it still works. And the scanners find known CVEs in third-party components, not new bugs in your own code, so pair them with the model and with fuzzing for real coverage.

Run Peonie only against systems you own or are authorized to test.

## License

The launcher is [MIT](./LICENSE). The model's base weights carry their own license, recorded in [`NOTICE.md`](./NOTICE.md) along with the tools Peonie orchestrates. You are responsible for meeting those terms and for using Peonie within your authorization.
