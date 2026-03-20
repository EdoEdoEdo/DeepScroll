import { NextResponse } from "next/server";

/**
 * GET /api/health
 *
 * Checks that environment variables are set and APIs are reachable.
 * Use this to verify your setup before running the full pipeline.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  // Check GUARDIAN_API_KEY
  const guardianKey = process.env.GUARDIAN_API_KEY;
  if (!guardianKey) {
    checks.guardian = { ok: false, detail: "GUARDIAN_API_KEY not set in .env.local" };
  } else {
    try {
      const res = await fetch(
        `https://content.guardianapis.com/search?q=test&page-size=1&api-key=${guardianKey}`,
        { next: { revalidate: 0 } }
      );
      if (res.ok) {
        const data = await res.json();
        checks.guardian = {
          ok: true,
          detail: `Connected — ${data.response.total.toLocaleString()} total articles accessible`,
        };
      } else {
        const text = await res.text();
        checks.guardian = { ok: false, detail: `HTTP ${res.status}: ${text.slice(0, 100)}` };
      }
    } catch (err) {
      checks.guardian = {
        ok: false,
        detail: `Network error: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  }

  // Check GROQ_API_KEY
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    checks.groq = { ok: false, detail: "GROQ_API_KEY not set (optional if Mistral configured)" };
  } else {
    checks.groq = {
      ok: groqKey.startsWith("gsk_"),
      detail: groqKey.startsWith("gsk_")
        ? "Key format valid (gsk_...)"
        : "Key format unexpected — Groq keys typically start with gsk_",
    };
  }

  // Check MISTRAL_API_KEY
  const mistralKey = process.env.MISTRAL_API_KEY;
  if (!mistralKey) {
    checks.mistral = { ok: false, detail: "MISTRAL_API_KEY not set (optional if Groq configured)" };
  } else {
    checks.mistral = { ok: true, detail: "Key configured" };
  }

  // At least one LLM must be available
  const hasLlm = checks.groq?.ok || checks.mistral?.ok;
  const guardianOk = checks.guardian?.ok ?? false;
  const allOk = hasLlm && guardianOk;

  return NextResponse.json(
    {
      status: allOk ? "ready" : "misconfigured",
      checks,
      hint: allOk
        ? "All systems ready. Go to / to start."
        : !hasLlm
          ? "At least one LLM key required (GROQ_API_KEY or MISTRAL_API_KEY)."
          : "Fix the issues above, then restart the dev server.",
    },
    { status: allOk ? 200 : 503 }
  );
}
