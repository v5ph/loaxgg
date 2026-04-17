# loax Repo Overview

## 1. Brief Architectural Review

This repo is a Python CLI that orchestrates structured LLM reasoning workflows against an OpenAI-compatible chat backend. The current architecture is intentionally small: CLI layer, model client, orchestration engine, scoring/aggregation/finalization, and local artifact persistence.

This approach was chosen because it is the shortest path to a usable system: keep inference backend-agnostic, keep orchestration in the app layer, and persist enough state to inspect how runs were produced.

## 2. The Code

### What This Repo Is

`loax` is a CLI-native reasoning system for running prompts through a few distinct execution modes instead of only doing a single plain completion.

It currently supports:

- `chat`: one structured answer
- `recurse`: iterative refinement across multiple steps
- `simulate`: multiple outcome branches with scoring and pruning
- `multiply`: multiple role-based perspectives with scoring and pruning
- `pattern`: pattern hypothesis generation, duplicate clustering, scoring, and pruning

The repo targets OpenAI-compatible APIs and defaults to a local Ollama-style setup. The default model in code is `gemma4:e4b`, and settings are loaded from `LOAX_` environment variables or a local `.env`.

### Core Architectural Shape

The implementation is centered on five core layers:

1. CLI interaction in `src/loax/cli.py`
2. Model transport in `src/loax/client.py`
3. Run orchestration in `src/loax/engine.py`
4. Deterministic evaluation and synthesis in `src/loax/scoring.py`, `src/loax/aggregator.py`, and `src/loax/finalizer.py`
5. Artifact persistence in `src/loax/persistence.py`

The important design rule is that the model is not the architecture. The model is a replaceable backend. The repo’s product value is the execution system around it.

### Request Lifecycle

At a high level, a request moves through the system like this:

```text
user prompt
  -> CLI mode selection
  -> mode-specific prompt builder
  -> OpenAI-compatible chat request
  -> structured node generation
  -> deterministic scoring
  -> pruning / selection
  -> summary-only aggregation
  -> final answer synthesis
  -> persisted run artifact
```

For simple `chat`, this path is mostly linear.

For `simulate`, `multiply`, and `pattern`, the engine generates multiple candidate nodes first, then scores and prunes them before finalization.

For `recurse`, the engine runs stepwise refinement, carrying forward the best surviving summary and aggregated context instead of replaying the full raw output history.

### Structured Output Contract

The system is built around structured output rather than free-form text blobs. Each successful generation is expected to fit the runtime schema represented by `StructuredModelOutput`.

Conceptually, each response contains:

```json
{
  "answer": "full answer",
  "summary": "compressed answer",
  "confidence": 0.0,
  "assumptions": ["explicit premises"],
  "risks": ["failure modes and uncertainty"]
}
```

This contract matters because the rest of the engine depends on it. Scoring, pruning, aggregation, and finalization all work better when they operate on typed fields instead of trying to recover structure from arbitrary prose.

The client retries once if structured JSON parsing fails. If that still fails and the engine is using the best-effort path, it coerces unstructured output into the expected shape with a fallback summary and default confidence.

### How Modes Differ

#### `chat`

`chat` is the shortest path through the system. The engine generates one node, scores it, and finalizes without needing a multi-node selection pass.

Use case:

- fast single-turn answers

Trade-off:

- lowest latency, least exploration

#### `recurse`

`recurse` runs a bounded multi-step refinement loop. At each step, the engine generates a new node, scores the current survivors, prunes if needed, aggregates summary context, and uses the top surviving summary to guide the next step.

Use case:

- ambiguous prompts
- planning
- iterative improvement

Trade-off:

- slower than `chat`, but more deliberate

#### `simulate`

`simulate` creates multiple parallel branches that represent different plausible outcomes. Those branches are scored and pruned, then the survivors are merged into a final answer.

Use case:

- forecasting
- scenario comparison
- trade-off analysis

Trade-off:

- more breadth, more tokens

#### `multiply`

`multiply` uses role-based perspectives. The current role set includes:

- strategist
- skeptic
- builder
- simulator
- pattern

Each role produces a structured node. The engine then scores, prunes, aggregates, and finalizes.

Use case:

- strategy work
- disagreement surfacing
- multi-angle critique

Trade-off:

- better diversity of reasoning, but depends on role separation quality

#### `pattern`

`pattern` generates several pattern hypotheses, clusters duplicates, then scores and prunes the surviving unique nodes before finalization.

Use case:

- finding repeated themes
- reducing noisy input into signal

Trade-off:

- useful for synthesis, but only as strong as the upstream pattern summaries

### Scoring and Selection

The engine uses deterministic scoring rather than letting the model decide everything implicitly. Nodes are ranked by weighted dimensions configured in settings:

- confidence: `0.35`
- relevance: `0.30`
- actionability: `0.20`
- novelty: `0.15`

This matters for two reasons:

1. It keeps branch selection inspectable.
2. It prevents multi-branch modes from turning into uncontrolled prompt sprawl.

After scoring, the engine keeps only the top `k` nodes based on `LOAX_TOP_K`. All other candidates are marked as `pruned`.

For `pattern`, duplicate summaries are clustered before selection so near-identical ideas do not crowd out diversity.

### Aggregation and Finalization

The aggregator builds a `GlobalContext` from the surviving nodes. It merges summaries, assumptions, and risks while avoiding unnecessary reuse of raw prior outputs.

That summary-only discipline is one of the repo’s more important architectural decisions. It helps contain context size and makes recursive runs easier to inspect later.

Finalization is handled separately from generation. The finalizer can synthesize the final answer through the model-backed path, but the engine also keeps deterministic fallback behavior when the model-backed finalization is unavailable or should be skipped.

### CLI Experience

Running `loax` with no subcommand opens interactive mode. The CLI includes:

- slash commands for each reasoning mode
- `/history` to inspect recent runs
- `/show <run_id>` to inspect a persisted run
- `/clear`, `/help`, and `/exit`

The prompt UX also handles large pasted content by replacing it in the visible prompt with a placeholder such as `[Pasted 1234 Characters]` while still submitting the full underlying text.

The CLI renders results with `rich` panels and can show simple bar-chart style graphs when:

- a prompt explicitly asks for a chart or graph and numeric answer lines are present
- a multi-branch mode has enough scored nodes to render node score bars

### Persistence Model

The repo persists artifacts under `.loax/`.

Current storage layout:

```text
.loax/
  runs/<run_id>.json
  sessions/<session_id>.json
```

Run artifacts include:

- run metadata
- timestamps
- all generated nodes
- final answer and confidence
- execution trace steps
- mode-specific metadata such as depth, branches, or agents

Session artifacts capture the interactive conversation history at the session level.

This persistence model is important because it turns the CLI into an inspectable system rather than a disposable shell wrapper.

### Configuration Model

Settings live in `src/loax/config.py` and are loaded with `pydantic-settings`.

Notable defaults:

- `LOAX_MODEL=gemma4:e4b`
- `LOAX_API_BASE=http://localhost:11434/v1`
- `LOAX_TIMEOUT_SECONDS=120`
- `LOAX_MAX_RECURSE_DEPTH=3`
- `LOAX_DEFAULT_BRANCHES=3`
- `LOAX_DEFAULT_AGENTS=5`
- `LOAX_TOP_K=3`
- `LOAX_MAX_TOKENS_PER_RUN=12000`

The engine also estimates token usage and can finalize early when the configured per-run budget would be exceeded.

### Repo Map

Main source files:

- `src/loax/cli.py`: interactive CLI, subcommands, history/show views, startup UI
- `src/loax/client.py`: async OpenAI-compatible client and structured output parsing
- `src/loax/engine.py`: orchestration for all run modes
- `src/loax/scoring.py`: deterministic scoring and ranking
- `src/loax/aggregator.py`: summary-only context builder
- `src/loax/finalizer.py`: final answer synthesis
- `src/loax/persistence.py`: run/session storage
- `src/loax/prompts.py`: prompt builders and structured-output instructions
- `src/loax/types.py`: typed runtime models
- `src/loax/graphs.py`: terminal graph extraction and rendering

Test coverage currently exists for the major subsystems under `tests/`.

### Current Strengths

- small and readable codebase
- clear typed boundaries
- backend-agnostic model integration
- deterministic scoring and pruning
- explicit artifact persistence
- interactive CLI with usable inspection commands

### Current Constraints

- the system still depends heavily on model compliance with structured output
- scoring is deterministic but heuristic
- no retrieval layer exists
- no tool-execution or action-gating stack exists beyond the current text workflow
- no dedicated training pipeline is part of the tracked runtime code

### Bottom Line

This repo is already a functioning orchestration system, not a placeholder. Its current identity is a local-first CLI for structured reasoning workflows that explores prompts through recursion, branching, role multiplicity, and pattern synthesis while keeping enough typed state to inspect how results were produced.

## 3. Security/Edge-Case Check

This document is descriptive only. The main operational risk in the repo remains model-output reliability: malformed JSON, low-quality confidence calibration, and backend availability still affect run quality even though the client and engine include retries, fallbacks, and token-budget guards.
