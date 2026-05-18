import { useState } from 'react';

const TABS = [
  { id: 'hardWords', label: 'Hard Words' },
  { id: 'simple', label: 'Simple Version' },
  { id: 'why', label: 'Why These Words' },
];

export default function SentenceBreakdown({ data, sentence }) {
  const [tab, setTab] = useState('hardWords');

  return (
    <article className="card fade-in slide-up">
      <p className="breakdown-quote">&quot;{sentence}&quot;</p>

      <section className="card breakdown-section">
        <h3 className="section-label">Translation</h3>
        <p className="def-text">{data.translation}</p>
      </section>

      <div className="level-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'active' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'hardWords' && (
        <div className="card breakdown-tab-panel">
          {data.hardWords.length === 0 ? (
            <p className="breakdown-empty">No hard words in this sentence.</p>
          ) : (
            data.hardWords.map((w, i) => (
              <div key={i} className="example-row">
                <div className="breakdown-word-block">
                  <div className="breakdown-word-heading">
                    <span className="breakdown-word-title">{w.word}</span>
                    {w.field && <span className="chip">{w.field}</span>}
                    {w.register && <span className="chip">{w.register}</span>}
                  </div>
                  <p className="breakdown-ru">{w.ru}</p>
                  {w.example && (
                    <p className="breakdown-example">&quot;{w.example}&quot;</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'simple' && (
        <div className="card breakdown-tab-panel">
          <div className="example-row">
            <p className="breakdown-tab-text">{data.simpleVersion}</p>
          </div>
        </div>
      )}

      {tab === 'why' && (
        <div className="card breakdown-tab-panel">
          <div className="example-row">
            <p className="breakdown-tab-text breakdown-tab-text--muted">{data.toneAnalysis}</p>
          </div>
        </div>
      )}
    </article>
  );
}
