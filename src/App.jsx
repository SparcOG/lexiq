import { useEffect, useRef, useState } from 'react';
import {
  Search, Volume2, History, Eye, EyeOff, Loader2, Sparkles,
  Send, MessageCircle, AlertCircle, SpellCheck,
} from 'lucide-react';
import { supabase } from './supabase.js';
import SentenceBreakdown from './SentenceBreakdown.jsx';
import GrammarCheck from './GrammarCheck.jsx';
// -----------------------------------------------------------------------------
// Lexiq — English learning tool
// Uses Haiku for everything (cheap). Real API via /api/lookup and /api/chat.
// Run: `npm run dev` (Vercel dev — frontend + API, hot reload).
// -----------------------------------------------------------------------------

const LEVELS = [
  { id: 'simple', label: 'Simple' },
  { id: 'medium', label: 'Medium' },
  { id: 'deep', label: 'Deep' },
];

async function apiLookup(word, level) {
  const res = await fetch('/api/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, level }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Lookup failed (${res.status})`);
  }
  return res.json();
}

function authHeaders(token) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function dbLoadHistory(token) {
  const r = await fetch('/api/sync?action=load', { headers: authHeaders(token) });
  if (!r.ok) return null;
  const { words } = await r.json();
  return words;
}

function dbSaveHistory(token, words) {
  fetch('/api/sync', { method: 'POST', headers: authHeaders(token),
    body: JSON.stringify({ action: 'save-history', words }) }).catch(() => {});
}

async function dbLoadChat(token, word) {
  const r = await fetch(`/api/sync?action=load-chat&word=${encodeURIComponent(word)}`,
    { headers: authHeaders(token) });
  if (!r.ok) return null;
  const { messages } = await r.json();
  return messages;
}

function dbSaveChat(token, word, messages) {
  fetch('/api/sync', { method: 'POST', headers: authHeaders(token),
    body: JSON.stringify({ action: 'save-chat', word, messages }) }).catch(() => {});
}

const CHAT_KEY = (word) => `lexiq:chat:${word.toLowerCase()}`;
const CHAT_CAP = 40;

function loadChat(word) {
  try {
    const raw = localStorage.getItem(CHAT_KEY(word));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveChat(word, messages) {
  try {
    localStorage.setItem(CHAT_KEY(word), JSON.stringify(messages.slice(-CHAT_CAP)));
  } catch {}
}

async function apiBreakdown(sentence) {
  const res = await fetch('/api/breakdown', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sentence }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Breakdown failed (${res.status})`);
  }
  return res.json();
}

async function apiChat(word, messages) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, messages }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Chat failed (${res.status})`);
  }
  return res.json();
}

// Preferred voices in order. First available wins.
// macOS comes with Samantha (US, very natural), Moira (Irish), Alex (US),
// Daniel (UK), Karen (AU). "Premium" / "Enhanced" versions sound even better
// if the user has downloaded them in System Settings → Accessibility → Spoken Content.
const VOICE_PRIORITY = [
  'Samantha (Premium)',
  'Samantha (Enhanced)',
  'Samantha',
  'Ava (Premium)',
  'Ava',
  'Allison',
  'Karen (Premium)',
  'Karen',
  'Moira (Premium)',
  'Moira',
  'Daniel (Premium)',
  'Daniel',
  'Alex',
];

let cachedVoice = null;

function pickBestVoice() {
  if (cachedVoice) return cachedVoice;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null; // not yet loaded
  for (const name of VOICE_PRIORITY) {
    const v = voices.find((v) => v.name === name);
    if (v) { cachedVoice = v; return v; }
  }
  // Fallback: any English voice
  const en = voices.find((v) => v.lang && v.lang.startsWith('en'));
  if (en) { cachedVoice = en; return en; }
  cachedVoice = voices[0] || null;
  return cachedVoice;
}

/** Where Supabase magic links should return (must be allowlisted in Supabase dashboard). */
function authRedirectUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function speak(text) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  const utter = new SpeechSynthesisUtterance(text);
  const voice = pickBestVoice();
  if (voice) {
    utter.voice = voice;
    utter.lang = voice.lang || 'en-US';
  } else {
    utter.lang = 'en-US';
  }
  utter.rate = 0.95;   // 0.9-1.0 range — clear, not rushed
  utter.pitch = 1.0;   // natural, neither high nor low
  utter.volume = 1.0;  // normal full volume
  synth.cancel();
  synth.speak(utter);
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authSent, setAuthSent] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [input, setInput] = useState('');
  const [wordData, setWordData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [levelLoading, setLevelLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showRussian, setShowRussian] = useState(false);
  const [level, setLevel] = useState('medium');
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lexiq:history') || '[]'); } catch { return []; }
  });

  const [sentenceData, setSentenceData] = useState(null);
  const [grammarMode, setGrammarMode] = useState(false);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || 'light';
    } catch {
      return 'light';
    }
  });
  const chatEndRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('theme', theme);
    } catch {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#1a1a1a' : '#f5f5f5';
  }, [theme]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setAuthLoading(false);
      if (
        (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY')
        && window.location.hash.includes('access_token')
      ) {
        window.history.replaceState(null, '', authRedirectUrl());
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    dbLoadHistory(session.access_token).then(words => {
      if (words?.length) {
        setHistory(words);
        localStorage.setItem('lexiq:history', JSON.stringify(words));
      }
    }).catch(() => {});
  }, [session?.user?.id]);

  // Warm up speech voices on mount. Some browsers load them async,
  // so we trigger the load and listen for the voiceschanged event.
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const handler = () => {
      const v = pickBestVoice();
      if (v) console.log(`[Lexiq] voice: ${v.name} (${v.lang})`);
    };
    window.speechSynthesis.getVoices(); // kick off load
    handler(); // try immediately
    window.speechSynthesis.addEventListener('voiceschanged', handler);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', handler);
  }, []);

  async function doBreakdown(sentence) {
    setLoading(true);
    setError(null);
    setWordData(null);
    setSentenceData(null);
    try {
      const data = await apiBreakdown(sentence);
      setSentenceData(data);
      setHistory((h) => {
        const updated = [sentence, ...h.filter((s) => s.toLowerCase() !== sentence.toLowerCase())].slice(0, 20);
        try { localStorage.setItem('lexiq:history', JSON.stringify(updated)); } catch {}
        if (session) dbSaveHistory(session.access_token, updated);
        return updated;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function doLookup(word, lvl) {
    setLoading(true);
    setError(null);
    setSentenceData(null);
    setChatMessages(loadChat(word));
    setChatError(null);
    dbLoadChat(session.access_token, word).then(msgs => {
      if (msgs?.length) { setChatMessages(msgs); saveChat(word, msgs); }
    }).catch(() => {});
    try {
      const data = await apiLookup(word, lvl);
      setWordData({
        word: data.word,
        pronunciation: data.pronunciation,
        partOfSpeech: data.partOfSpeech,
        levels: {
          simple: lvl === 'simple' ? data.definition : null,
          medium: lvl === 'medium' ? data.definition : null,
          deep: lvl === 'deep' ? data.definition : null,
        },
        examples: data.examples,
      });
      setHistory((h) => {
        const updated = [word, ...h.filter((w) => w.toLowerCase() !== word.toLowerCase())].slice(0, 20);
        try { localStorage.setItem('lexiq:history', JSON.stringify(updated)); } catch {}
        dbSaveHistory(session.access_token, updated);
        return updated;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLevel(newLevel) {
    if (!wordData || wordData.levels[newLevel]) return;
    setLevelLoading(true);
    setError(null);
    try {
      const data = await apiLookup(wordData.word, newLevel);
      setWordData((prev) => prev ? { ...prev, levels: { ...prev.levels, [newLevel]: data.definition } } : prev);
    } catch (err) {
      setError(err.message);
    } finally {
      setLevelLoading(false);
    }
  }

  function handleSearch(e) {
    if (e) e.preventDefault();
    const w = input.trim();
    if (!w || loading) return;
    setGrammarMode(false);
    if (w.includes(' ')) doBreakdown(w);
    else doLookup(w, level);
  }

  function pickFromHistory(w) {
    setInput(w);
    setSidebarOpen(false);
    if (w.includes(' ')) doBreakdown(w);
    else doLookup(w, level);
  }

  function onLevelChange(newLevel) {
    setLevel(newLevel);
    if (wordData && !wordData.levels[newLevel]) fetchLevel(newLevel);
  }

  async function sendChat(e) {
    if (e) e.preventDefault();
    const text = chatInput.trim();
    if (!text || chatLoading || !wordData) return;
    const newMessages = [...chatMessages, { role: 'user', content: text }];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);
    setChatError(null);
    try {
      const { reply } = await apiChat(wordData.word, newMessages);
      setChatMessages((prev) => {
        const updated = [...prev, { role: 'assistant', content: reply }];
        saveChat(wordData.word, updated);
        dbSaveChat(session.access_token, wordData.word, updated);
        return updated;
      });
    } catch (err) {
      setChatError(err.message);
    } finally {
      setChatLoading(false);
    }
  }

  const currentDefinition = wordData ? wordData.levels[level] : null;
  const showCompactSearch = Boolean(wordData || sentenceData || loading);

  async function sendMagicLink(e) {
    e.preventDefault();
    setAuthSubmitting(true);
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail,
      options: { emailRedirectTo: authRedirectUrl() },
    });
    if (error) setAuthError(error.message);
    else setAuthSent(true);
    setAuthSubmitting(false);
  }

  if (authLoading) {
    return (
      <div className="page-center">
        <Loader2 size={24} className="loading-spinner" aria-hidden />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="auth-page">
        <div className="auth-card slide-up">
          <div className="auth-brand">
            <Sparkles size={22} className="brand__icon" aria-hidden />
            <h1>Lexiq</h1>
          </div>
          <p className="auth-tagline">English learning tool</p>
          {authSent ? (
            <p className="auth-message">
              Check your email — we sent a sign-in link to{' '}
              <strong>{authEmail}</strong>.
            </p>
          ) : (
            <form onSubmit={sendMagicLink}>
              <p className="auth-form-text">
                Sign in to sync your learning across devices.
              </p>
              <p className="auth-redirect-hint">
                Magic link will open: <strong>{authRedirectUrl()}</strong>
                {import.meta.env.DEV && (
                  <>
                    {' '}
                    — add this URL in Supabase → Authentication → URL Configuration → Redirect URLs.
                  </>
                )}
              </p>
              <input
                type="email"
                className="auth-input"
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
              {authError && <p className="auth-error">{authError}</p>}
              <button type="submit" className="auth-submit" disabled={authSubmitting}>
                {authSubmitting ? 'Sending…' : 'Send magic link'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <Sparkles size={20} className="brand__icon" aria-hidden />
          <h1 className="brand__title">Lexiq</h1>
        </div>

        {showCompactSearch && (
          <form onSubmit={handleSearch} className="search-bar">
            <Search size={16} className="search-bar__icon" aria-hidden />
            <input
              className="search-bar__input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a word or sentence..."
              disabled={loading}
            />
          </form>
        )}

        <div className="header-actions">
          <button
            type="button"
            className={`btn-icon${grammarMode ? ' btn-icon--active' : ''}`}
            onClick={() => {
              setGrammarMode((v) => !v);
              setWordData(null);
              setSentenceData(null);
              setError(null);
            }}
            title="Grammar check"
          >
            <SpellCheck size={14} aria-hidden />
            Grammar
          </button>
          <button
            type="button"
            className="btn-icon btn-history"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-expanded={sidebarOpen}
            aria-controls="history-sidebar"
          >
            <History size={14} aria-hidden />
            History
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setShowRussian((v) => !v)}
            title={showRussian ? 'Hide Russian' : 'Show Russian'}
          >
            {showRussian ? <EyeOff size={14} /> : <Eye size={14} />} RU
          </button>
          <button
            type="button"
            className="btn-ghost btn-ghost--faint"
            onClick={() => supabase.auth.signOut()}
            title={session.user.email}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="app-body">
        <button
          type="button"
          className={`sidebar-backdrop${sidebarOpen ? ' open' : ''}`}
          onClick={() => setSidebarOpen(false)}
          aria-hidden={!sidebarOpen}
          tabIndex={sidebarOpen ? 0 : -1}
        />
        <aside
          id="history-sidebar"
          className={`app-sidebar${sidebarOpen ? ' open' : ''}`}
        >
          <div className="sidebar-label">
            <History size={14} aria-hidden /> History
          </div>
          {history.length === 0 ? (
            <p className="sidebar-empty">No words yet.</p>
          ) : (
            history.map((w, i) => (
              <button
                key={i}
                type="button"
                className={`hist-item${wordData?.word === w ? ' hist-item--active' : ''}`}
                onClick={() => pickFromHistory(w)}
              >
                {w}
              </button>
            ))
          )}
        </aside>

        <main className="app-main">
          {loading && (
            <div className="loading-row fade-in">
              <Loader2 size={20} className="loading-spinner" aria-hidden />
              Looking up...
            </div>
          )}

          {error && !loading && (
            <div className="error-banner error-banner--page slide-up" role="alert">
              <AlertCircle size={16} aria-hidden />
              <div>
                <div className="error-banner__title">Something went wrong</div>
                <div className="error-banner__detail">{error}</div>
              </div>
            </div>
          )}

          {!grammarMode && !loading && !wordData && !sentenceData && !error && (
            <section className="search-hero fade-in">
              <h2 className="search-hero__title">Start learning</h2>
              <p className="search-hero__subtitle">
                Type any English word or short sentence. Lexiq will explain it,
                give examples, and read it out loud.
              </p>
              <form onSubmit={handleSearch} className="search-hero__form">
                <Search size={20} className="search-hero__icon" aria-hidden />
                <input
                  className="search-hero__input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a word or sentence..."
                  disabled={loading}
                />
              </form>
              <div className="daily-tip-slot" aria-hidden />
            </section>
          )}

          {grammarMode && !loading && (
            <GrammarCheck />
          )}

          {!grammarMode && !loading && sentenceData && (
            <SentenceBreakdown
              data={sentenceData}
              sentence={input.trim()}
              onWordClick={(word) => { setInput(word); doLookup(word, level); }}
            />
          )}

          {!grammarMode && !loading && wordData && (
            <article key={wordData.word} className="card fade-in">
              <div className="word-header">
                <h2 className="word-title">{wordData.word}</h2>
                <button
                  type="button"
                  className="audio-btn"
                  onClick={() => speak(wordData.word)}
                  title="Hear pronunciation"
                >
                  <Volume2 size={20} />
                </button>
              </div>
              <div className="word-meta">
                {wordData.pronunciation && <span>{wordData.pronunciation}</span>}
                {wordData.partOfSpeech && (
                  <>
                    <span className="word-meta__sep">·</span>
                    <span className="word-meta__pos">{wordData.partOfSpeech}</span>
                  </>
                )}
              </div>

              <div className="level-tabs">
                {LEVELS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={level === l.id ? 'active' : undefined}
                    onClick={() => onLevelChange(l.id)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>

              <section className="section-block">
                <h3 className="section-label">Definition</h3>
                {levelLoading && !currentDefinition ? (
                  <div className="loading-inline">
                    <Loader2 size={16} className="loading-spinner" aria-hidden />
                    Loading {level}...
                  </div>
                ) : currentDefinition ? (
                  <>
                    <p className="def-text">{currentDefinition.en}</p>
                    {showRussian && currentDefinition.ru && (
                      <p className="def-ru">{currentDefinition.ru}</p>
                    )}
                  </>
                ) : null}
              </section>

              {wordData.examples?.length > 0 && (
                <section className="examples-section">
                  <h3 className="section-label">Examples</h3>
                  {wordData.examples.map((ex, i) => (
                    <div key={i}>
                      <div className="example-row">
                        <p className="example-text">{ex.en}</p>
                        <button
                          type="button"
                          className="audio-btn"
                          onClick={() => speak(ex.en)}
                          title="Hear"
                        >
                          <Volume2 size={16} />
                        </button>
                      </div>
                      {showRussian && ex.ru && <p className="example-ru">{ex.ru}</p>}
                    </div>
                  ))}
                </section>
              )}

              <section className="chat-panel">
                <div className="chat-header">
                  <MessageCircle size={16} className="icon-accent" aria-hidden />
                  <h3 className="section-label">Ask about this word</h3>
                </div>

                {chatMessages.length === 0 && !chatLoading && (
                  <p className="chat-hint">
                    Ask anything about <em>&quot;{wordData.word}&quot;</em>.
                    Why it exists. How it connects to other ideas. Ask to translate a part if you want.
                  </p>
                )}

                <div className="chat-messages">
                  {chatMessages.map((m, i) => (
                    <div key={i} className="msg-row">
                      <div
                        className={`chat-bubble ${m.role === 'user' ? 'user' : 'assistant'}`}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="msg-row">
                      <div className="chat-bubble assistant thinking">
                        <Loader2 size={14} className="loading-spinner" aria-hidden />
                        Thinking...
                      </div>
                    </div>
                  )}
                  {chatError && (
                    <div className="msg-row">
                      <div className="error-banner" role="alert">
                        <AlertCircle size={16} aria-hidden />
                        <span>{chatError}</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={sendChat} className="chat-form">
                  <input
                    className="chat-input"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={`Ask about "${wordData.word}"...`}
                    disabled={chatLoading}
                  />
                  <button
                    type="submit"
                    className="send-btn"
                    disabled={chatLoading || !chatInput.trim()}
                    title="Send"
                  >
                    <Send size={16} />
                  </button>
                </form>
              </section>
            </article>
          )}
        </main>
      </div>
    </div>
  );
}
