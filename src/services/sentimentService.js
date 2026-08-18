// ─── Keyword-based priority detection ─────────────────────────────
const HIGH_PRIORITY_WORDS = [
  "bug", "broken", "crash", "error", "fail", "unable", "locked",
  "security", "breach", "hack", "unauthorized", "payout", "payment",
  "money", "balance", "withdraw", "refund", "fraud", "loss", "missing",
  "urgent", "critical", "blocked", "denied", "rejected", "anxiety",
  "compliance", "legal", "escalat",
];

const LOW_PRIORITY_WORDS = [
  "great", "love", "excellent", "amazing", "appreciated", "praise",
  "improved", "fantastic", "awesome", "wonderful", "perfect", "thank",
  "thanks", "happy", "pleased", "impressed", "recommend", "best",
  "cosmetic", "minor", "nice to have", "optional",
];

export function keywordPriority(text) {
  const lower = text.toLowerCase();
  const words = lower.split(/\W+/);

  let highScore = 0;
  let lowScore = 0;

  words.forEach((w) => {
    if (HIGH_PRIORITY_WORDS.some((hw) => w.includes(hw))) highScore++;
    if (LOW_PRIORITY_WORDS.includes(w)) lowScore++;
  });

  if (highScore >= 2 || (highScore >= 1 && lowScore === 0)) return "High";
  if (lowScore >= 2 && highScore === 0) return "Low";
  return "Medium";
}

// ─── Keyword-based fallback (instant, no API cost) ───────────────
const POSITIVE_WORDS = [
  "great", "love", "excellent", "amazing", "improved", "appreciated",
  "quick", "helpful", "fantastic", "awesome", "good", "thank", "thanks",
  "happy", "pleased", "impressed", "perfect", "wonderful", "praise",
  "fast", "efficient", "smooth", "enjoy", "recommend", "best", "solved",
];

const NEGATIVE_WORDS = [
  "frustrated", "slow", "bug", "broken", "disappointed", "issue", "fail",
  "worst", "terrible", "awful", "poor", "confusing", "error", "crash",
  "delay", "missing", "wrong", "bad", "hate", "annoying", "complaint",
  "problem", "difficult", "refused", "rejected", "stuck", "anxiety",
  "surprise", "surprised", "unable", "strain", "outdated", "repetitive",
];

export function keywordSentiment(text) {
  const lower = text.toLowerCase();
  const words = lower.split(/\W+/);

  let posScore = 0;
  let negScore = 0;

  words.forEach((w) => {
    if (POSITIVE_WORDS.includes(w)) posScore++;
    if (NEGATIVE_WORDS.includes(w)) negScore++;
  });

  // Handle negation: "not great", "wasn't helpful", etc.
  const negationPatterns = /\b(not|no|never|don'?t|doesn'?t|wasn'?t|isn'?t|can'?t|won'?t)\s+\w+/gi;
  const negations = lower.match(negationPatterns) || [];
  negations.forEach((phrase) => {
    const target = phrase.split(/\s+/)[1];
    if (POSITIVE_WORDS.includes(target)) {
      posScore--;
      negScore++;
    }
    if (NEGATIVE_WORDS.includes(target)) {
      negScore--;
      posScore++;
    }
  });

  const total = posScore + negScore;
  let sentiment, confidence;

  if (total === 0) {
    sentiment = "Neutral";
    confidence = 50;
  } else if (posScore > negScore) {
    sentiment = "Positive";
    confidence = Math.min(95, Math.round((posScore / total) * 80) + 15);
  } else if (negScore > posScore) {
    sentiment = "Negative";
    confidence = Math.min(95, Math.round((negScore / total) * 80) + 15);
  } else {
    sentiment = "Neutral";
    confidence = 40;
  }

  return {
    sentiment,
    confidence,
    reason: `Keyword analysis: ${posScore} positive, ${negScore} negative signals`,
    priority: keywordPriority(text),
    method: "keyword",
  };
}

// ─── AI-based classification (accurate, uses API tokens) ─────────
export async function aiSentiment(text) {
  const res = await fetch("/api/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  const data = await res.json();
  return { ...data, method: "ai" };
}

// ─── Hybrid: try AI first, fall back to keywords ─────────────────
export async function classifySentiment(text) {
  try {
    const result = await aiSentiment(text);
    return result;
  } catch {
    // AI unavailable — use keyword fallback
    return keywordSentiment(text);
  }
}
