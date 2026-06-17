"""
classifier.py — Safety & Classification
==========================================
Hard-coded escalation rules and classification guidance.
Acts as a safety net on top of the LLM's decisions.

Design decisions documented in Details.md §3.3.
"""

import re
from typing import List, Dict, Any, Optional, Tuple

# ---------------------------------------------------------------------------
# Escalation keyword patterns
# ---------------------------------------------------------------------------
# These patterns trigger MANDATORY escalation regardless of LLM output.
# We err on the side of caution — it's better to escalate unnecessarily
# than to give a wrong answer on a sensitive topic.

ESCALATION_PATTERNS = [
    # Financial / fraud
    r"\b(fraud|stolen\s+identity|identity\s+theft|unauthorized\s+charge)\b",
    r"\b(refund\s+me\s+today|chargeback|dispute\s+a?\s*charge)\b",
    r"\b(billing\s+dispute|overcharged|double\s+charged)\b",
    
    # Account security
    r"\b(account\s+hacked|account\s+compromised|suspicious\s+activity)\b",
    r"\b(password\s+leaked|credentials?\s+stolen)\b",
    
    # Legal / compliance
    r"\b(legal\s+action|lawsuit|attorney|lawyer|subpoena)\b",
    r"\b(gdpr\s+request|data\s+subject\s+request|right\s+to\s+be\s+forgotten)\b",
    
    # Score / grade manipulation (HackerRank-specific)
    r"\b(increase\s+my\s+score|change\s+my\s+grade|unfairly\s+graded)\b",
    r"\b(review\s+my\s+answers?|regrade|re-evaluate)\b",
    r"\b(move\s+me\s+to\s+the\s+next\s+round)\b",
    
    # Access restoration without authorisation
    r"\b(restore\s+my\s+access|give\s+me\s+back\s+access)\b",
    
    # System-wide outage
    r"\b(site\s+is\s+down|all\s+requests?\s+(are\s+)?failing)\b",
    r"\b(completely?\s+(not\s+)?working|everything\s+is\s+broken)\b",
    
    # Prompt injection / system rule extraction
    r"\b(internal\s+rules?|system\s+prompt|show\s+your\s+instructions?)\b",
    r"\b(display\s+all|reveal\s+your|logique\s+exacte)\b",  # French injection
    r"\b(règles?\s+internes?|documents?\s+récupérés?)\b",
    
    # Subscription / billing management (needs admin action)
    r"\b(pause\s+(our|my)\s+subscription|cancel\s+(our|my)\s+(subscription|plan))\b",
    
    # Payment issues with order IDs
    r"\b(order\s+id|payment\s+issue|cs_live_)\b",
    
    # Infosec / compliance forms
    r"\b(infosec\s+process|security\s+questionnaire|compliance\s+form)\b",
]

# Compile patterns for efficiency
_ESCALATION_REGEXES = [
    re.compile(p, re.IGNORECASE) for p in ESCALATION_PATTERNS
]

# ---------------------------------------------------------------------------
# Invalid / out-of-scope patterns
# ---------------------------------------------------------------------------
INVALID_PATTERNS = [
    # Malicious requests
    r"\b(delete\s+all\s+files|rm\s+-rf|format\s+c:)\b",
    r"\b(give\s+me\s+(the\s+)?code\s+to)\b",
    
    # Completely off-topic
    r"\b(actor\s+in\s+iron\s+man|who\s+played|movie|film)\b",
    r"\b(recipe|weather|sports?\s+score)\b",
    
    # Social pleasantries (not a real support issue)
    r"^(thanks?|thank\s+you)(\s+(for|so\s+much|a\s+lot).*)?[.!]*$",
    r"^(ok|okay|got\s+it|great|perfect|nice|cool)\s*[.!]*$",
    r"^(happy\s+to\s+help|you'?re\s+welcome|no\s+problem)(\s+.*)?[.!]*$",
]

_INVALID_REGEXES = [
    re.compile(p, re.IGNORECASE) for p in INVALID_PATTERNS
]


# ---------------------------------------------------------------------------
# Product area inference
# ---------------------------------------------------------------------------
# Maps corpus directory paths to canonical product areas
CATEGORY_TO_PRODUCT_AREA = {
    # HackerRank
    "screen": "screen",
    "interviews": "interviews",
    "engage": "engage",
    "library": "library",
    "hackerrank_community": "community",
    "general-help": "general_help",
    "integrations": "integrations",
    "settings": "settings",
    "skillup": "skillup",
    "chakra": "chakra",
    "uncategorized": "general_help",
    
    # Claude
    "claude": "claude_general",
    "amazon-bedrock": "amazon_bedrock",
    "claude-api-and-console": "claude_api",
    "claude-code": "claude_code",
    "claude-desktop": "claude_desktop",
    "claude-for-education": "claude_education",
    "claude-for-government": "claude_government",
    "claude-for-nonprofits": "claude_nonprofits",
    "claude-in-chrome": "claude_chrome",
    "claude-mobile-apps": "claude_mobile",
    "connectors": "connectors",
    "identity-management-sso-jit-scim": "identity_management",
    "privacy-and-legal": "privacy",
    "pro-and-max-plans": "plans_and_billing",
    "safeguards": "safeguards",
    "team-and-enterprise-plans": "team_enterprise",
    
    # Visa
    "support": "general_support",
    "consumer": "consumer_support",
    "small-business": "small_business_support",
}


def infer_product_area(results: List[Dict[str, Any]], company: Optional[str] = None) -> str:
    """Infer the product area from the top retrieved documents.
    
    Uses the directory structure of the best-matching document to determine
    the most relevant product area.
    """
    if not results:
        if company:
            return f"{company.lower()}_general"
        return "general"
    
    # Use the top result's category
    top_category = results[0].get("category", "general")
    
    # Extract the first directory level from the category path
    first_dir = top_category.split("/")[0] if "/" in top_category else top_category
    
    return CATEGORY_TO_PRODUCT_AREA.get(first_dir, top_category)


# ---------------------------------------------------------------------------
# Relevance threshold
# ---------------------------------------------------------------------------
# Minimum relevance score below which we consider the corpus doesn't cover the topic
MIN_RELEVANCE_THRESHOLD = -2.0


# ---------------------------------------------------------------------------
# Escalation check
# ---------------------------------------------------------------------------
def check_escalation(
    issue: str,
    subject: str = "",
    retrieval_results: Optional[List[Dict[str, Any]]] = None,
    max_relevance_score: float = 1.0,
    relevance_threshold: float = MIN_RELEVANCE_THRESHOLD,
) -> Tuple[bool, str]:
    """Check if a ticket should be escalated.
    
    Returns:
        (should_escalate: bool, reason: str)
    """
    combined_text = f"{subject} {issue}".strip()
    
    # Check against hard-coded escalation patterns
    for regex in _ESCALATION_REGEXES:
        match = regex.search(combined_text)
        if match:
            return True, f"Matched escalation pattern: '{match.group()}'"
    
    # Check retrieval confidence — if corpus doesn't cover the topic
    if max_relevance_score < relevance_threshold:
        return True, (
            f"Low retrieval confidence ({max_relevance_score:.3f} < "
            f"{relevance_threshold}). Corpus may not cover this topic."
        )
    
    return False, ""


# ---------------------------------------------------------------------------
# Invalid / out-of-scope check
# ---------------------------------------------------------------------------
def check_invalid(issue: str, subject: str = "") -> Tuple[bool, str]:
    """Check if a ticket is invalid / out-of-scope.
    
    Returns:
        (is_invalid: bool, reason: str)
    """
    combined_text = f"{subject} {issue}".strip()
    
    for regex in _INVALID_REGEXES:
        match = regex.search(combined_text)
        if match:
            return True, f"Matched invalid pattern: '{match.group()}'"
    
    return False, ""


# ---------------------------------------------------------------------------
# Classification guidance
# ---------------------------------------------------------------------------


def get_classification_guidance(
    issue: str,
    subject: str,
    company: Optional[str],
    retrieval_results: List[Dict[str, Any]],
    max_relevance_score: float,
) -> Dict[str, Any]:
    """Generate classification guidance for the LLM.
    
    This pre-processes the ticket and provides hints to the LLM about
    how to classify it. The LLM makes the final decision, but these
    hints help it align with our evaluation criteria.
    
    Returns dict with:
        - should_escalate: bool
        - escalation_reason: str
        - is_invalid: bool
        - invalid_reason: str
        - suggested_product_area: str
        - suggested_request_type: str or None
    """
    # Check escalation
    should_escalate, escalation_reason = check_escalation(
        issue, subject, retrieval_results, max_relevance_score
    )
    
    # Check invalid
    is_invalid, invalid_reason = check_invalid(issue, subject)
    
    # Infer product area
    product_area = infer_product_area(retrieval_results, company)
    
    # Suggest request type based on heuristics
    suggested_type = None
    combined = f"{subject} {issue}".lower()
    
    if is_invalid:
        suggested_type = "invalid"
    elif any(kw in combined for kw in ["not working", "error", "broken", "failing", "bug", "crash", "down"]):
        suggested_type = "bug"
    elif any(kw in combined for kw in ["can you add", "i wish", "would be great", "feature request", "suggestion"]):
        suggested_type = "feature_request"
    else:
        suggested_type = "product_issue"
    
    return {
        "should_escalate": should_escalate,
        "escalation_reason": escalation_reason,
        "is_invalid": is_invalid,
        "invalid_reason": invalid_reason,
        "suggested_product_area": product_area,
        "suggested_request_type": suggested_type,
    }


if __name__ == "__main__":
    # Quick test with sample tickets
    test_cases = [
        ("Please increase my score, the platform graded me unfairly", "Score dispute", "HackerRank"),
        ("How do I add extra time for candidates?", "Time accommodation", "HackerRank"),
        ("My identity has been stolen", "Identity theft", "Visa"),
        ("Give me the code to delete all files", "Delete files", None),
        ("Thank you for helping me", "", None),
        ("it's not working, help", "Help needed", None),
    ]
    
    for issue, subject, company in test_cases:
        guidance = get_classification_guidance(issue, subject, company, [], 0.5)
        print(f"\nIssue: {issue[:50]}...")
        print(f"  Escalate: {guidance['should_escalate']} — {guidance['escalation_reason']}")
        print(f"  Invalid: {guidance['is_invalid']} — {guidance['invalid_reason']}")
        print(f"  Type: {guidance['suggested_request_type']}")
