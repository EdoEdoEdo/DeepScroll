import { NextResponse } from "next/server";
import { checkProvider } from "@/app/utils/llm";
import { checkGuardian } from "@/app/utils/guardian-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Real checks, not just "is the key set":
 * - Guardian: live request (+ any rate-limit headers it returns)
 * - Groq / Mistral: key validated and configured model present in the
 *   provider's /models list — catches retired models. Costs no tokens.
 */
export async function GET() {
  const [guardian, groq, mistral] = await Promise.all([
    checkGuardian(),
    checkProvider("groq"),
    checkProvider("mistral"),
  ]);

  const hasLlm = groq.ok || mistral.ok;
  const allOk = hasLlm && guardian.ok;

  return NextResponse.json(
    {
      status: allOk ? "ready" : "misconfigured",
      checks: {
        guardian: { ok: guardian.ok, detail: guardian.detail },
        groq,
        mistral,
      },
      guardianRateLimit: guardian.rateLimit,
      hint: allOk
        ? groq.ok && mistral.ok
          ? "All systems ready. Go to / to start."
          : "Ready with a single LLM provider — configure the other one for automatic fallback."
        : !hasLlm
          ? "No working LLM: check GROQ_API_KEY / MISTRAL_API_KEY and the model IDs in app/utils/llm.ts."
          : "Fix the Guardian issue above, then restart the dev server.",
    },
    { status: allOk ? 200 : 503 }
  );
}
