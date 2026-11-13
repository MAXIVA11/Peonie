# Third-party notices

The Peonie launcher (the code in this repository) is under the MIT license.
Peonie does not redistribute any model weights. It downloads them from their
original source when you build the model, and you accept that model's license at
that point.

## Model

The `peonie` model is built on [Qwen3-Coder 30B](https://ollama.com/library/qwen3-coder),
pulled from the Ollama library. See that model card for its license and terms.
The build recipe is in `models/Modelfile`. If you point the Modelfile or the
`PEONIE_MODEL` variable at a different base, that base's license applies instead.

## Tools Peonie orchestrates

These are installed separately and are not redistributed here:

- [Ollama](https://github.com/ollama/ollama), MIT
- [Claude Code](https://www.anthropic.com/claude-code), Anthropic, proprietary
- [OpenAI Codex CLI](https://github.com/openai/codex), see its license
- [CAI, Cybersecurity AI](https://github.com/aliasrobotics/CAI), open source. Commercial use may require a license from Alias Robotics.
- [cve-bin-tool](https://github.com/intel/cve-bin-tool), GPL-3.0
- [Trivy](https://github.com/aquasecurity/trivy), Apache-2.0
- [Syft](https://github.com/anchore/syft) and [Grype](https://github.com/anchore/grype), Apache-2.0

You are responsible for meeting each component's license terms and for using
Peonie only against systems you own or are explicitly authorized to test.
