"""
main.py — Support Triage Agent Entry Point
=============================================
Orchestrates the full pipeline:
  1. Build/load corpus index
  2. Read support tickets CSV
  3. For each ticket: retrieve → classify → generate response
  4. Write output CSV

Usage:
    python main.py [--provider ollama|gemini|groq] [--input PATH] [--output PATH]

Design decisions documented in Details.md §3.5.
"""

import os
import sys
import csv
import json
import time
import argparse
from collections import deque
from pathlib import Path
from typing import Dict, Any, List, Optional

from dotenv import load_dotenv

# Add the code directory to the path so imports work
sys.path.insert(0, str(Path(__file__).parent))

from indexer import get_or_build_index
from retriever import HybridRetriever
from classifier import get_classification_guidance
from agent import process_ticket


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).parent.parent
DATA_ROOT = PROJECT_ROOT / "data"
DEFAULT_INPUT = PROJECT_ROOT / "support_tickets" / "support_tickets.csv"
DEFAULT_OUTPUT = PROJECT_ROOT / "support_tickets" / "output.csv"
OUTPUT_COLUMNS = [
    "issue", "subject", "company",
    "response", "product_area", "status", "request_type", "justification"
]


# ---------------------------------------------------------------------------
# CSV I/O
# ---------------------------------------------------------------------------
def read_tickets(input_path: str) -> List[Dict[str, str]]:
    """Read support tickets from a CSV file.
    
    Returns a list of dicts with keys: issue, subject, company.
    """
    tickets = []
    with open(input_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Normalise field names to lowercase
            normalised = {k.strip().lower(): v.strip() if v else "" for k, v in row.items()}
            tickets.append({
                "issue": normalised.get("issue", ""),
                "subject": normalised.get("subject", ""),
                "company": normalised.get("company", ""),
            })
    return tickets


def write_output(results: List[Dict[str, Any]], output_path: str) -> None:
    """Write agent results to the output CSV."""
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        for row in results:
            # Ensure all columns exist
            output_row = {col: row.get(col, "") for col in OUTPUT_COLUMNS}
            writer.writerow(output_row)


# ---------------------------------------------------------------------------
# Progress display
# ---------------------------------------------------------------------------
def print_progress(current: int, total: int, ticket: Dict, result: Dict) -> None:
    """Print a concise progress update for each processed ticket."""
    status_icon = "[ESC]" if result["status"] == "escalated" else "[OK]"
    issue_preview = ticket["issue"][:60].replace("\n", " ")
    print(f"  [{current}/{total}] {status_icon} {result['status']:10s} | "
          f"{result['request_type']:16s} | {result['product_area'][:20]:20s} | "
          f"{issue_preview}...")


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------
def run_pipeline(
    input_path: str,
    output_path: str,
    provider: str = "gemini",
    use_reranker: bool = True,
) -> None:
    """Run the full support triage pipeline."""
    
    start_time = time.time()
    
    # ── Step 1: Build / load the corpus index ──────────────────────────────
    print("=" * 70)
    print("STEP 1: Building corpus index")
    print("=" * 70)
    index, metadata, embedding_model = get_or_build_index(str(DATA_ROOT))
    
    # ── Step 2: Initialise the retriever ────────────────────────────────────
    print("\n" + "=" * 70)
    print("STEP 2: Initialising hybrid retriever")
    print("=" * 70)
    retriever = HybridRetriever(
        index, metadata, embedding_model, use_reranker=use_reranker
    )
    
    # ── Step 3: Read input tickets ──────────────────────────────────────────
    print("\n" + "=" * 70)
    print("STEP 3: Reading support tickets")
    print("=" * 70)
    tickets = read_tickets(input_path)
    print(f"  Loaded {len(tickets)} tickets from {input_path}")
    
    # ── Step 4: Process each ticket ─────────────────────────────────────────
    print("\n" + "=" * 70)
    print(f"STEP 4: Processing {len(tickets)} tickets (provider={provider})")
    print("=" * 70)
    
    results = []
    is_local = provider.lower() == "ollama"

    # ── Sliding-window rate limiter ─────────────────────────────────────
    # Gemini free tier ≈ 15 RPM.  We target 14 RPM to leave headroom.
    MAX_RPM = 14
    WINDOW = 60                                     # seconds
    request_times: deque = deque()                   # timestamps of recent calls

    def rate_limit_wait() -> None:
        """Sleep only as long as needed to stay under MAX_RPM."""
        if is_local:
            return                                  # no limit for Ollama
        now = time.time()
        # Drop timestamps older than the window
        while request_times and request_times[0] < now - WINDOW:
            request_times.popleft()
        if len(request_times) >= MAX_RPM:
            # Must wait until the oldest request exits the window
            wait = request_times[0] + WINDOW - now + 0.5  # 0.5 s buffer
            if wait > 0:
                print(f"  ⏳ Rate-limit: waiting {wait:.1f}s "
                      f"({len(request_times)} reqs in last 60 s)")
                time.sleep(wait)

    for i, ticket in enumerate(tickets, 1):
        issue = ticket["issue"]
        subject = ticket["subject"]
        company = ticket["company"]
        
        try:
            # 4a. Retrieve relevant documents
            company_for_search = company if company.lower() not in ("none", "") else None
            retrieved_docs = retriever.retrieve(
                query=f"{subject} {issue}".strip(),
                company=company_for_search,
                top_k=5,
            )
            
            # 4b. Get retrieval confidence
            max_score = retriever.get_max_relevance_score(retrieved_docs)
            
            # 4c. Run classifier safety checks
            guidance = get_classification_guidance(
                issue=issue,
                subject=subject,
                company=company_for_search,
                retrieval_results=retrieved_docs,
                max_relevance_score=max_score,
            )
            
            # 4d. Rate-limit, then call the LLM
            rate_limit_wait()
            request_times.append(time.time())

            result = process_ticket(
                issue=issue,
                subject=subject,
                company=company,
                retrieved_docs=retrieved_docs,
                classification_guidance=guidance,
                provider=provider,
            )
            
            # 4e. Attach original ticket info
            result["issue"] = issue
            result["subject"] = subject
            result["company"] = company
            
            print_progress(i, len(tickets), ticket, result)
            
        except Exception as e:
            print(f"  [{i}/{len(tickets)}] [ERR] ERROR processing ticket: {e}")
            # Safe fallback: escalate the ticket
            result = {
                "issue": issue,
                "subject": subject,
                "company": company,
                "status": "escalated",
                "product_area": "general",
                "response": "We are unable to process your request at this time. A human agent will follow up shortly.",
                "justification": f"Processing error: {str(e)[:200]}",
                "request_type": "product_issue",
            }
        
        results.append(result)
    
    # ── Step 5: Write output CSV ────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("STEP 5: Writing output")
    print("=" * 70)
    write_output(results, output_path)
    print(f"  [OK] Output written to {output_path}")
    
    # ── Summary ─────────────────────────────────────────────────────────────
    elapsed = time.time() - start_time
    replied = sum(1 for r in results if r["status"] == "replied")
    escalated = sum(1 for r in results if r["status"] == "escalated")
    
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"  Total tickets:  {len(results)}")
    print(f"  Replied:        {replied}")
    print(f"  Escalated:      {escalated}")
    print(f"  Time elapsed:   {elapsed:.1f}s ({elapsed/len(results):.1f}s per ticket)")
    print(f"  Provider:       {provider}")
    print(f"  Output file:    {output_path}")
    
    # Request type breakdown
    from collections import Counter
    type_counts = Counter(r["request_type"] for r in results)
    print(f"\n  Request types:")
    for rt, count in type_counts.most_common():
        print(f"    {rt}: {count}")
    
    print("\n[OK] Pipeline complete!")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Support Triage Agent — HackerRank Orchestrate",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--provider",
        choices=["gemini", "ollama", "groq"],
        default=os.environ.get("LLM_PROVIDER", "ollama"),
        help="LLM provider to use (default: ollama — local qwen2.5:7b)",
    )
    parser.add_argument(
        "--input",
        default=str(DEFAULT_INPUT),
        help=f"Input CSV path (default: {DEFAULT_INPUT})",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help=f"Output CSV path (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--no-reranker",
        action="store_true",
        help="Disable cross-encoder reranking (faster but less accurate)",
    )
    parser.add_argument(
        "--sample",
        action="store_true",
        help="Run against sample_support_tickets.csv instead",
    )
    
    args = parser.parse_args()
    
    # Load .env file
    env_path = PROJECT_ROOT / ".env"
    if env_path.exists():
        load_dotenv(env_path)
        print(f"[main] Loaded .env from {env_path}")
    else:
        load_dotenv()  # Try default locations
        print("[main] No .env found at project root, using environment variables")
    
    # Override input/output if --sample is used
    input_path = args.input
    output_path = args.output
    if args.sample:
        input_path = str(PROJECT_ROOT / "support_tickets" / "sample_support_tickets.csv")
        output_path = str(PROJECT_ROOT / "support_tickets" / "sample_output.csv")
        print(f"[main] Running in SAMPLE mode")
    
    print(f"[main] Provider: {args.provider}")
    print(f"[main] Input:    {input_path}")
    print(f"[main] Output:   {output_path}")
    print(f"[main] Reranker: {'OFF' if args.no_reranker else 'ON'}")
    print()
    
    run_pipeline(
        input_path=input_path,
        output_path=output_path,
        provider=args.provider,
        use_reranker=not args.no_reranker,
    )


if __name__ == "__main__":
    main()
