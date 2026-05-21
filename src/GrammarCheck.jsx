import { useState } from 'react';
import { SpellCheck, Loader2, AlertCircle, Copy, Check, ChevronRight } from 'lucide-react';

async function apiGrammar(text) {
  const res = await fetch('/api/grammar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Grammar check failed (${res.status})`);
  }
  return res.json();
}

export default function GrammarCheck() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  async function handleCheck(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await apiGrammar(trimmed);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function copyText() {
    if (!result) return;
    navigator.clipboard.writeText(result.corrected).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  const noErrors = result && result.changes.length === 0;

  return (
    <article className="card grammar-panel fade-in">
      <div className="grammar-header">
        <SpellCheck size={20} className="icon-accent" aria-hidden />
        <h2 className="grammar-title">Grammar Check</h2>
      </div>
      <p className="grammar-hint">
        Paste a paragraph and Claude will correct it gently — your voice stays intact.
      </p>

      <form onSubmit={handleCheck} className="grammar-form">
        <textarea
          className="grammar-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your English paragraph here..."
          rows={5}
          disabled={loading}
          maxLength={3000}
        />
        <div className="grammar-form-footer">
          <span className="grammar-char-count">{text.length}/3000</span>
          <button
            type="submit"
            className="grammar-btn"
            disabled={loading || !text.trim()}
          >
            {loading ? (
              <>
                <Loader2 size={15} className="loading-spinner" aria-hidden />
                Checking…
              </>
            ) : (
              'Check grammar'
            )}
          </button>
        </div>
      </form>

      {error && !loading && (
        <div className="error-banner slide-up" role="alert">
          <AlertCircle size={16} aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="grammar-result slide-up">
          <div className="grammar-corrected-header">
            <h3 className="section-label">Corrected text</h3>
            <button
              type="button"
              className="copy-btn"
              onClick={copyText}
              title="Copy corrected text"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <p className={`grammar-corrected${noErrors ? ' grammar-corrected--clean' : ''}`}>
            {result.corrected}
          </p>

          {noErrors ? (
            <div className="grammar-no-errors">
              <Check size={16} className="grammar-check-icon" aria-hidden />
              No grammatical errors found.
            </div>
          ) : (
            <div className="grammar-changes">
              <h3 className="section-label">What changed</h3>
              {result.changes.map((c, i) => (
                <div key={i} className="grammar-change-item">
                  <div className="grammar-change-diff">
                    <span className="grammar-original">{c.original}</span>
                    <ChevronRight size={14} className="grammar-arrow" aria-hidden />
                    <span className="grammar-fix">{c.corrected}</span>
                  </div>
                  <p className="grammar-reason">{c.reason}</p>
                </div>
              ))}
            </div>
          )}

          {result.overall && (
            <p className="grammar-overall">{result.overall}</p>
          )}
        </div>
      )}
    </article>
  );
}
