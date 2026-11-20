export type Source = {
  title: string
  text: string
  score?: number
}

export type RagResult = {
  answer: string
  sources: Source[]
  raw: unknown
  status: number
  ms: number
}

export type Settings = {
  endpoint: string
  bodyTemplate: string
  headers: string
}

export const DEFAULT_SETTINGS: Settings = {
  endpoint: 'mock',
  bodyTemplate: '{\n  "query": {{prompt}},\n  "top_k": 5\n}',
  headers: '{\n  "Content-Type": "application/json"\n}',
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function pick(o: Obj, keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k]
  return undefined
}

function extractAnswer(data: unknown): string {
  if (typeof data === 'string') return data
  if (!isObj(data)) return ''
  const direct = pick(data, ['answer', 'response', 'output', 'result', 'text', 'content', 'message'])
  if (typeof direct === 'string') return direct
  if (isObj(direct)) return extractAnswer(direct)
  const choices = data.choices
  if (Array.isArray(choices) && isObj(choices[0])) {
    const msg = choices[0].message
    if (isObj(msg) && typeof msg.content === 'string') return msg.content
    if (typeof choices[0].text === 'string') return choices[0].text
  }
  if (isObj(data.data)) return extractAnswer(data.data)
  return ''
}

function toSource(item: unknown, i: number): Source {
  if (typeof item === 'string') return { title: `Chunk ${i + 1}`, text: item }
  if (!isObj(item)) return { title: `Chunk ${i + 1}`, text: JSON.stringify(item) }
  const meta = isObj(item.metadata) ? item.metadata : {}
  const text = pick(item, ['text', 'content', 'page_content', 'chunk', 'document', 'snippet'])
  const title =
    pick(item, ['title', 'source', 'file', 'filename', 'url', 'id']) ??
    pick(meta, ['title', 'source', 'file', 'filename', 'url'])
  const score = pick(item, ['score', 'similarity', 'relevance_score', 'distance'])
  return {
    title: title != null ? String(title) : `Chunk ${i + 1}`,
    text: typeof text === 'string' ? text : JSON.stringify(item, null, 2),
    score: typeof score === 'number' ? score : undefined,
  }
}

function extractSources(data: unknown): Source[] {
  if (!isObj(data)) return []
  const list = pick(data, [
    'sources', 'contexts', 'context', 'documents', 'docs', 'chunks', 'retrieved', 'source_documents', 'citations',
  ])
  if (Array.isArray(list)) return list.map(toSource)
  if (isObj(data.data)) return extractSources(data.data)
  return []
}

function buildBody(template: string, prompt: string): string {
  const filled = template.replaceAll('{{prompt}}', JSON.stringify(prompt))
  JSON.parse(filled) // validate
  return filled
}

async function mockQuery(prompt: string): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 600 + Math.random() * 600))
  return {
    answer: `This is a mock answer for: "${prompt}". Set an endpoint in Settings to hit your RAG service.`,
    sources: [
      { source: 'handbook.pdf', text: 'Retrieved passage one, used as supporting context for the answer.', score: 0.91 },
      { source: 'faq.md', text: 'A second retrieved chunk with somewhat lower relevance.', score: 0.78 },
      { source: 'notes.txt', text: 'A third chunk, loosely related to the query.', score: 0.62 },
    ],
  }
}

export async function runQuery(prompt: string, s: Settings, signal?: AbortSignal): Promise<RagResult> {
  const t0 = performance.now()
  let raw: unknown
  let status = 200

  if (!s.endpoint.trim() || s.endpoint.trim() === 'mock') {
    raw = await mockQuery(prompt)
  } else {
    let headers: Record<string, string>
    try {
      headers = s.headers.trim() ? JSON.parse(s.headers) : {}
    } catch {
      throw new Error('Headers are not valid JSON')
    }
    let body: string
    try {
      body = buildBody(s.bodyTemplate, prompt)
    } catch {
      throw new Error('Request body template is not valid JSON after inserting the prompt')
    }
    const res = await fetch(s.endpoint, { method: 'POST', headers, body, signal })
    status = res.status
    const text = await res.text()
    try {
      raw = JSON.parse(text)
    } catch {
      raw = text
    }
    if (!res.ok) {
      const msg = typeof raw === 'string' ? raw : JSON.stringify(raw)
      throw Object.assign(new Error(`HTTP ${res.status}: ${msg.slice(0, 300)}`), { raw, status })
    }
  }

  return {
    answer: extractAnswer(raw),
    sources: extractSources(raw),
    raw,
    status,
    ms: Math.round(performance.now() - t0),
  }
}
