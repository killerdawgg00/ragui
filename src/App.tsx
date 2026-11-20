import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SETTINGS, runQuery, type RagResult, type Settings } from './rag'
import './App.css'

type HistoryItem = { prompt: string; at: number }

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? { ...fallback, ...JSON.parse(v) } : fallback
  } catch {
    return fallback
  }
}

function loadHistory(): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem('rag.history') ?? '[]')
  } catch {
    return []
  }
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => load('rag.settings', DEFAULT_SETTINGS))
  const [showSettings, setShowSettings] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RagResult | null>(null)
  const [error, setError] = useState<{ message: string; raw?: unknown } | null>(null)
  const [tab, setTab] = useState<'answer' | 'raw'>('answer')
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    try { localStorage.setItem('rag.settings', JSON.stringify(settings)) } catch { /* ignore */ }
  }, [settings])
  useEffect(() => {
    try { localStorage.setItem('rag.history', JSON.stringify(history)) } catch { /* ignore */ }
  }, [history])

  async function submit() {
    const p = prompt.trim()
    if (!p || loading) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)
    setResult(null)
    setHistory((h) => [{ prompt: p, at: Date.now() }, ...h.filter((x) => x.prompt !== p)].slice(0, 15))
    try {
      setResult(await runQuery(p, settings, ctrl.signal))
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError({ message: (e as Error).message, raw: (e as { raw?: unknown }).raw })
    } finally {
      if (abortRef.current === ctrl) setLoading(false)
    }
  }

  function cancel() {
    abortRef.current?.abort()
    setLoading(false)
  }

  const isMock = !settings.endpoint.trim() || settings.endpoint.trim() === 'mock'

  return (
    <div className="page">
      <header className="top">
        <div className="brand">
          <span className="dot" />
          RAG Tester
        </div>
        <button className="ghost" onClick={() => setShowSettings((s) => !s)}>
          <span className={`pill ${isMock ? 'mock' : 'live'}`}>{isMock ? 'mock' : 'live'}</span>
          <span className="endpoint">{isMock ? 'No endpoint set' : settings.endpoint}</span>
          <span className="chev">{showSettings ? '▴' : '▾'}</span>
        </button>
      </header>

      {showSettings && (
        <section className="card settings">
          <label>
            <span>Endpoint (POST)</span>
            <input
              value={settings.endpoint}
              placeholder="http://localhost:8000/query  — or 'mock'"
              onChange={(e) => setSettings({ ...settings, endpoint: e.target.value })}
            />
          </label>
          <div className="row">
            <label>
              <span>
                Body template <em>{'{{prompt}}'} is replaced with the prompt</em>
              </span>
              <textarea
                rows={5}
                spellCheck={false}
                value={settings.bodyTemplate}
                onChange={(e) => setSettings({ ...settings, bodyTemplate: e.target.value })}
              />
            </label>
            <label>
              <span>Headers</span>
              <textarea
                rows={5}
                spellCheck={false}
                value={settings.headers}
                onChange={(e) => setSettings({ ...settings, headers: e.target.value })}
              />
            </label>
          </div>
          <div className="settings-foot">
            <button className="link" onClick={() => setSettings(DEFAULT_SETTINGS)}>Reset to defaults</button>
          </div>
        </section>
      )}

      <main>
        <section className="card composer">
          <textarea
            autoFocus
            rows={4}
            value={prompt}
            placeholder="Ask your knowledge base something…"
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                submit()
              }
            }}
          />
          <div className="composer-foot">
            <span className="hint">Ctrl + Enter to send</span>
            <div className="actions">
              {prompt && !loading && (
                <button className="ghost" onClick={() => setPrompt('')}>Clear</button>
              )}
              {loading ? (
                <button className="secondary" onClick={cancel}>Cancel</button>
              ) : (
                <button className="primary" disabled={!prompt.trim()} onClick={submit}>Send</button>
              )}
            </div>
          </div>
        </section>

        {history.length > 0 && !loading && !result && !error && (
          <section className="history">
            <div className="history-head">
              <span>Recent</span>
              <button className="link" onClick={() => setHistory([])}>Clear</button>
            </div>
            <div className="chips">
              {history.map((h) => (
                <button key={h.at} className="chip" title={h.prompt} onClick={() => setPrompt(h.prompt)}>
                  {h.prompt}
                </button>
              ))}
            </div>
          </section>
        )}

        {loading && (
          <section className="card result">
            <div className="skeleton" />
            <div className="skeleton short" />
            <div className="skeleton mid" />
          </section>
        )}

        {error && (
          <section className="card error">
            <strong>Request failed</strong>
            <p>{error.message}</p>
            {error.message.includes('Failed to fetch') && (
              <p className="sub">Likely a CORS or network issue. Try the dev proxy: set the endpoint to <code>/rag/your-path</code> (see README).</p>
            )}
          </section>
        )}

        {result && (
          <section className="card result">
            <div className="result-head">
              <div className="tabs">
                <button className={tab === 'answer' ? 'on' : ''} onClick={() => setTab('answer')}>Answer</button>
                <button className={tab === 'raw' ? 'on' : ''} onClick={() => setTab('raw')}>Raw JSON</button>
              </div>
              <div className="meta">
                <span>{result.status}</span>
                <span>{result.ms} ms</span>
                <span>{result.sources.length} sources</span>
              </div>
            </div>

            {tab === 'answer' ? (
              <>
                <div className="answer">
                  {result.answer || <span className="muted">No answer field found — check Raw JSON.</span>}
                </div>
                {result.answer && (
                  <button className="link copy" onClick={() => navigator.clipboard?.writeText(result.answer)}>
                    Copy answer
                  </button>
                )}
                {result.sources.length > 0 && (
                  <div className="sources">
                    <h3>Retrieved context</h3>
                    {result.sources.map((s, i) => (
                      <details key={i} className="source">
                        <summary>
                          <span className="idx">{i + 1}</span>
                          <span className="title">{s.title}</span>
                          {s.score !== undefined && <span className="score">{s.score.toFixed(3)}</span>}
                        </summary>
                        <pre>{s.text}</pre>
                      </details>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <pre className="raw">{JSON.stringify(result.raw, null, 2)}</pre>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
