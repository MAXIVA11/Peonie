# Third-party notices

The Peonie launcher (the code in this repository) is MIT-licensed. Peonie **does
not redistribute** any model weights; it downloads them from their original
sources at install time. Each model is governed by its own license, which you
accept when you pull it:

| Peonie model | Upstream | License |
|---|---|---|
| `peonie-code`  | [Qwen3-Coder 30B](https://ollama.com/library/qwen3-coder) | Apache-2.0 (see the model card) |
| `peonie-cyber` | [DeepHat V1 7B](https://huggingface.co/DeepHat/DeepHat-V1-7B) (ex-WhiteRabbitNeo), a Qwen2.5-Coder-7B fine-tune | Apache-2.0 **+ DeepHat Extended** usage restrictions |
| `peonie-sec`   | [Cisco Foundation-Sec-8B](https://huggingface.co/fdtn-ai/Foundation-Sec-8B-Reasoning-Q4_K_M-GGUF) | See the Foundation-Sec model card |

GGUF conversions are pulled from the respective Hugging Face repositories
(e.g. `mradermacher`, `fdtn-ai`) referenced in `models/Modelfile.*`.

### Tools orchestrated (installed separately, not redistributed)

- [Ollama](https://github.com/ollama/ollama) — MIT
- [Claude Code](https://www.anthropic.com/claude-code) — Anthropic, proprietary
- [OpenAI Codex CLI](https://github.com/openai/codex) — see its license
- [CAI — Cybersecurity AI](https://github.com/aliasrobotics/CAI) — open source; **commercial use may require a license from Alias Robotics**
- [cve-bin-tool](https://github.com/intel/cve-bin-tool) — GPL-3.0
- [Trivy](https://github.com/aquasecurity/trivy) — Apache-2.0
- [Syft](https://github.com/anchore/syft) / [Grype](https://github.com/anchore/grype) — Apache-2.0

The **DeepHat Extended** terms restrict military use, harming minors, harassment,
unauthorized personal-data processing, discrimination, and fully automated
legal-effect decisions. Review each model's card before production or commercial
use. You are solely responsible for using Peonie only against systems you own or
are explicitly authorised to test.
