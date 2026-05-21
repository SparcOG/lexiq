import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are Lexiq's gentle grammar coach. The user is an English learner (Russian speaker, A2-B1 level).

Correct grammatical errors in their text. Be encouraging, never harsh.

Rules:
- Fix clear grammatical errors only: wrong tense, missing/wrong articles, subject-verb agreement, wrong preposition, run-on sentences, missing punctuation that changes meaning.
- Do NOT change their vocabulary or personal style — preserve their voice.
- Do NOT flag stylistic preferences (Oxford comma, short sentences, informal tone if intentional).
- Explanations must be simple (A2-B1 English), one sentence each.
- If no errors exist, return an empty changes array.
- Max 8 corrections — focus on the most impactful ones.

Return ONLY this JSON, no markdown, no prose:
{
  "corrected": "Full corrected paragraph (identical to input if no errors)",
  "changes": [
    {
      "original": "exact wrong phrase from the original",
      "corrected": "corrected version of that phrase",
      "reason": "Short explanation, e.g. 'Use past tense here because the action already happened.'"
    }
  ],
  "overall": "One warm, encouraging sentence about their writing."
}`;

function strip(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'text required' });
  if (text.length > 3000) return res.status(400).json({ error: 'Text too long (max 3000 characters)' });

  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: text.trim() }],
    });

    const raw = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const parsed = JSON.parse(strip(raw));

    return res.status(200).json({
      corrected: parsed.corrected || text.trim(),
      changes: Array.isArray(parsed.changes) ? parsed.changes : [],
      overall: parsed.overall || '',
    });
  } catch (err) {
    console.error('[grammar]', err);
    return res.status(500).json({ error: err?.message || 'grammar check failed' });
  }
}
