# Support Ticket Triage Agent

> **HackerRank Orchestrate** — May 2026 Hackathon Submission

A terminal-based AI agent that triages customer support tickets across **HackerRank**, **Claude (Anthropic)**, and **Visa** using Retrieval-Augmented Generation (RAG) over a local support corpus. All responses are grounded exclusively in the provided documentation — zero hallucination, zero guessing.

---

## Architecture

```
┌─────────────────┐
│  support_tickets │
│  /tickets.csv   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────────────────────────────────┐
│   main.py       │     │              data/                           │
│   (Orchestrator)│     │  ├── hackerrank/ (600+ articles)             │
│                 │     │  ├── claude/    (150+ articles)              │
│  Rate Limiter   │     │  └── visa/     (20+ articles)               │
│  Pipeline Ctrl  │     └──────────────────┬───────────────────────────┘
└────────┬────────┘                        │
         │                                 │
         ▼                                 ▼
┌─────────────────┐     ┌──────────────────────────────────────────────┐
│  indexer.py     │────▶│  FAISS Vector Index + BM25 Keyword Index     │
│  (Corpus Index) │     │  768 docs → chunked by ## headers            │
└─────────────────┘     │  Embeddings: all-MiniLM-L6-v2 (local)       │
                        │  Cached to code/.cache/ after first build    │
                        └──────────────────┬───────────────────────────┘
                                           │
                                           ▼
┌─────────────────┐     ┌──────────────────────────────────────────────┐
│  retriever.py   │────▶│  Hybrid Retrieval Pipeline                   │
│  (Hybrid Search)│     │  1. Semantic search (FAISS)                  │
└─────────────────┘     │  2. Keyword search (BM25)                    │
                        │  3. Reciprocal Rank Fusion                   │
                        │  4. Cross-encoder reranking (MiniLM)         │
                        │  5. Company-scoped filtering                 │
                        └──────────────────┬───────────────────────────┘
                                           │
                                           ▼
┌─────────────────┐     ┌──────────────────────────────────────────────┐
│  classifier.py  │────▶│  Pre-classification Heuristics               │
│  (Safety Rules) │     │  - Billing/fraud/identity theft → escalate   │
└─────────────────┘     │  - Score disputes → escalate                 │
                        │  - Prompt injection detection → escalate     │
                        │  - Retrieval confidence threshold            │
                        └──────────────────┬───────────────────────────┘
                                           │
                                           ▼
┌─────────────────┐     ┌──────────────────────────────────────────────┐
│  agent.py       │────▶│  LLM Orchestrator                            │
│  (LLM Caller)   │     │  Providers: Ollama (local) │ Gemini │ Groq   │
└─────────────────┘     │  Structured JSON output                      │
                        │  Temperature = 0 (deterministic)             │
                        │  Retry logic for malformed responses         │
                        └──────────────────┬───────────────────────────┘
                                           │
                                           ▼
                        ┌──────────────────────────────────────────────┐
                        │           support_tickets/output.csv         │
                        └──────────────────────────────────────────────┘
```

---

## Setup

### Prerequisites

- Python 3.10+
- [Ollama](https://ollama.com) (for local inference) **or** a Google AI Studio API key

### 1. Install Dependencies

```bash
cd code
pip install -r requirements.txt
```

### 2. Configure LLM Provider

**Option A — Ollama (recommended, no API key needed):**

```bash
# Install Ollama from https://ollama.com
ollama pull qwen2.5:7b
```

**Option B — Google Gemini (cloud):**

1. Get a free API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Configure environment:

```bash
cp .env.example .env
# Edit .env and paste your GEMINI_API_KEY
```

**Option C — Groq (cloud fallback):**

1. Get a free API key at [console.groq.com/keys](https://console.groq.com/keys)
2. Add `GROQ_API_KEY` to your `.env`

---

## Usage

### Run the full pipeline (default: Ollama + Qwen2.5)

```bash
python code/main.py
```

### Select a specific provider

```bash
python code/main.py --provider ollama   # Local Qwen2.5:7b
python code/main.py --provider gemini   # Google Gemini 2.0 Flash
python code/main.py --provider groq     # Groq Llama 3.3 70B
```

### Run on sample tickets (for development)

```bash
python code/main.py --sample
```

### Skip reranking (faster, less accurate)

```bash
python code/main.py --no-reranker
```

### Use unbuffered output (real-time progress)

```bash
python -u code/main.py
```

### Start the API

```bash
uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

The API reuses the same retrieval, safety, and generation pipeline as the CLI.
Corpus indexing is performed during server startup, and `stream=true` is
supported in the body, query string, or `stream` / `X-Stream` header on the
analysis endpoint.

---

## Output Format

Results are written to `support_tickets/output.csv`:

| Column          | Description                                         |
|-----------------|-----------------------------------------------------|
| `issue`         | Original ticket text (passthrough)                  |
| `subject`       | Original subject line (passthrough)                 |
| `company`       | Company identifier (passthrough)                    |
| `status`        | `replied` or `escalated`                            |
| `product_area`  | Most relevant support category                      |
| `response`      | User-facing answer grounded in the corpus           |
| `justification` | Concise explanation of the routing decision         |
| `request_type`  | `product_issue`, `feature_request`, `bug`, `invalid`|

---

## Key Design Decisions

### Why RAG over pure prompting?

The corpus is ~5.7 MB across 768 markdown files — too large for any single prompt. RAG lets us retrieve only the 3–5 most relevant articles per ticket, ensuring grounded responses without context window overflow.

### Why hybrid retrieval (BM25 + semantic)?

- **Semantic search** catches meaning: "my card was stolen" → "report lost or stolen card"
- **BM25 keyword search** catches exact terms: order IDs, product names, specific features
- **Reciprocal Rank Fusion** merges both ranked lists without needing comparable score scales

### Why cross-encoder reranking?

The cross-encoder (`ms-marco-MiniLM-L-6-v2`) processes query-document pairs *jointly*, producing far more accurate relevance scores than the bi-encoder used for initial retrieval. Adds ~2s per ticket — worthwhile for 29 tickets.

### Why Ollama + Qwen2.5 over cloud APIs?

After testing Gemini (rate-limited on free tier) and Llama 3.1:8b (too slow on CPU), Qwen2.5:7b provided the best balance:
- **Excellent JSON output quality** — purpose-built for structured generation
- **Fast on CPU** — ~25-30 seconds per ticket vs 60+ for Llama 3.1
- **No rate limits** — local inference with zero API constraints
- **Privacy** — ticket data never leaves the machine

### Why escalation-first safety?

High-risk tickets (billing, fraud, identity theft, score disputes) are **always escalated** regardless of LLM confidence. This prevents the model from hallucinating "helpful" advice on sensitive matters where human judgment is required.

---

## Adversarial Input Handling

| Ticket Pattern                              | Handling                              |
|---------------------------------------------|---------------------------------------|
| French text requesting internal rules       | Ignore injection; respond normally    |
| "Give me code to delete all files"          | Classify as `invalid`                 |
| Vague "it's not working" with no company    | Request more information              |
| Score change / grade dispute requests       | Escalate to human agent               |
| Requests for internal fraud logic           | Escalate; do NOT reveal internals     |

---

## Technology Stack

| Component       | Technology                              | Cost          |
|-----------------|-----------------------------------------|---------------|
| Language        | Python 3.10+                            | Free          |
| LLM (primary)   | Ollama — Qwen2.5:7b                    | Free (local)  |
| LLM (fallback)  | Google Gemini 2.0 Flash                 | Free (API)    |
| LLM (fallback2) | Groq — Llama 3.3 70B                   | Free (API)    |
| Embeddings      | sentence-transformers/all-MiniLM-L6-v2  | Free (local)  |
| Reranker        | cross-encoder/ms-marco-MiniLM-L-6-v2   | Free (local)  |
| Vector Search   | FAISS (CPU)                             | Free (local)  |
| Keyword Search  | rank-bm25                               | Free (local)  |
| CSV handling    | pandas                                  | Free          |
| Secrets         | python-dotenv                           | Free          |

---

## Project Structure

```
.
├── README.md                        # This file — setup & approach overview
├── Details.md                       # Deep-dive into every design decision
├── log.txt                          # AI chat transcript
├── code/
│   ├── README.md                    # Code-level setup instructions
│   ├── main.py                      # Entry point — pipeline orchestration
│   ├── indexer.py                   # Corpus chunking & FAISS index builder
│   ├── retriever.py                 # Hybrid BM25 + semantic + reranker
│   ├── classifier.py               # Rule-based pre-classification
│   ├── agent.py                     # LLM provider abstraction & prompting
│   └── requirements.txt            # Python dependencies
├── data/
│   ├── hackerrank/                  # HackerRank help center articles
│   ├── claude/                      # Claude/Anthropic support docs
│   └── visa/                        # Visa consumer & merchant support
└── support_tickets/
    ├── support_tickets.csv          # Input: 29 tickets to triage
    ├── sample_support_tickets.csv   # Dev: sample with expected outputs
    └── output.csv                   # Output: agent predictions
```

---

## Further Reading

- [`Details.md`](./Details.md) — Comprehensive design decisions & rationale
- [`evalutation_criteria.md`](./evalutation_criteria.md) — Scoring rubric
- [`problem_statement.md`](./problem_statement.md) — Full task specification
- [`code/README.md`](./code/README.md) — Code-level documentation