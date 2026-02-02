import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Send, StopCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function ChatView({ sessionId, userId, model, topK, persona, onNewChat, onSessionUpdate, onSelectSession }){
  const { toast } = useToast()
  const [messages, setMessages] = useState([])
  const [userInput, setUserInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [citations, setCitations] = useState([])
  const [sessions, setSessions] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [llmOk, setLlmOk] = useState(null) // null unknown, true ok, false down
  const [llmModel, setLlmModel] = useState('')
  const [llmReason, setLlmReason] = useState('')
  const messagesEndRef = useRef(null)
  const esRef = useRef(null)
  const currentCitationsRef = useRef([])
  const API = (import.meta?.env?.VITE_API_BASE) || 'http://127.0.0.1:8000'

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  useEffect(() => { scrollToBottom() }, [messages])

  // Preload LLM health so the badge shows status even before first stream
  useEffect(() => {
    let aborted = false
    async function checkHealth(){
      try{
        const res = await fetch(`${API}/llm/health?mode=deep`).catch(()=>null)
        if (!res || !res.ok) return
        const data = await res.json()
        if (aborted) return
        if (data && typeof data === 'object'){
          // Support flattened or nested { quick: { ok, model, reason }, deep: { ... } }
          const flatOk = Object.prototype.hasOwnProperty.call(data, 'ok') ? data.ok : undefined
          const flatModel = data.model
          const flatReason = data.reason
          const quick = data.quick || {}
          const deep = data.deep || {}
          const resolvedOk = (flatOk !== undefined) ? !!flatOk : (deep.ok !== undefined ? !!deep.ok : (quick.ok !== undefined ? !!quick.ok : null))
          const resolvedModel = flatModel || deep.model || quick.model || ''
          const resolvedReason = flatReason || deep.reason || quick.reason || ''
          if (resolvedOk !== null) setLlmOk(!!resolvedOk)
          if (resolvedModel) setLlmModel(resolvedModel)
          if (resolvedReason) setLlmReason(resolvedReason)
        }
      }catch{}
    }
    checkHealth()
    return () => { aborted = true }
  }, [API])

  function startStream(text, assistantIndex){
    try {
      setIsStreaming(true)
      if (esRef.current) esRef.current.close()
      currentCitationsRef.current = []
      setCitations([])
  const url = new URL(`${API}/query_stream_sse`)
      url.searchParams.set('text', text)
      if (topK) url.searchParams.set('k', String(topK))
      if (model) url.searchParams.set('model', model)
      if (sessionId) url.searchParams.set('session_id', sessionId)
      if (persona) url.searchParams.set('persona', persona)
      if (userId) url.searchParams.set('user_id', userId)
  // Use default max_tokens; omit fast mode for higher-quality answers
      esRef.current = new EventSource(url.toString())
      // Batch UI updates for smoother perceived speed
      let buf = ''
      let rafId = 0
      const flush = () => {
        if (!buf) return
        const toAdd = buf
        buf = ''
        setMessages(prev => prev.map((m, i) => i === assistantIndex ? { ...m, content: (m.content || '') + toAdd } : m))
      }
      esRef.current.onmessage = (ev) => {
        const chunk = ev.data || ''
        buf += chunk
        if (!rafId) {
          rafId = requestAnimationFrame(() => { flush(); rafId = 0 })
        }
      }
      esRef.current.addEventListener('meta', (ev) => {
        try {
          const parsed = JSON.parse(ev.data)
          if (Array.isArray(parsed)) {
            // legacy: meta only contains citations array
            currentCitationsRef.current = parsed
            setCitations(parsed)
          } else if (parsed && typeof parsed === 'object') {
            if (parsed.citations) {
              const cits = parsed.citations || []
              currentCitationsRef.current = cits
              setCitations(cits)
            }
            if (Object.prototype.hasOwnProperty.call(parsed, 'llm_ok')) {
              setLlmOk(!!parsed.llm_ok)
            }
            if (parsed.llm_model) setLlmModel(parsed.llm_model)
            if (parsed.llm_reason) setLlmReason(parsed.llm_reason)
          }
        } catch {}
      })
      esRef.current.addEventListener('done', () => {
        if (esRef.current) esRef.current.close()
        flush()
        setMessages(prev => prev.map((m, i) => i === assistantIndex ? { ...m, citations: currentCitationsRef.current } : m))
        setIsStreaming(false)
      })
      esRef.current.onerror = () => {
        if (esRef.current) esRef.current.close()
        setIsStreaming(false)
        toast({ title: 'Streaming error', description: 'Connection closed or failed.', variant: 'destructive' })
      }
    } catch (e) {
      setIsStreaming(false)
      toast({ title: 'Error starting stream', description: String(e), variant: 'destructive' })
    }
  }

  async function sendMessage(){
    const text = userInput.trim()
    if (!text || isStreaming) return
    setUserInput('')
    setMessages(prev => [...prev, { role: 'user', content: text }])
    // Update session metadata on first message
    try{
      const raw = localStorage.getItem(`chat_${sessionId}`)
      const saved = raw ? JSON.parse(raw) : []
      const hadAny = Array.isArray(saved) && saved.some(m => (m?.content||'').trim())
      const title = hadAny ? (saved.find(m=>m.role==='user')?.content || text) : text
      if (typeof onSessionUpdate === 'function'){
        onSessionUpdate({ id: sessionId, title: (title||'New Chat').slice(0,60), updatedAt: new Date().toISOString() })
      }
    }catch{}
    const assistantIndex = messages.length + 1
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])
    startStream(text, assistantIndex)
  }

  // Persist chat by session in localStorage; restore when sessionId changes
  useEffect(() => {
    try{
      const raw = localStorage.getItem(`chat_${sessionId}`)
      const saved = raw ? JSON.parse(raw) : []
      if (Array.isArray(saved)) setMessages(saved)
      else setMessages([])
    }catch{ setMessages([]) }
    // reset input and streaming flags when session changes
    setUserInput('')
    setIsStreaming(false)
    setCitations([])
    refreshSessions()
    // Ensure current session appears in history even if created earlier
    try{
      const raw = localStorage.getItem(`chat_${sessionId}`)
      const saved = raw ? JSON.parse(raw) : []
      let title = 'New Chat'
      if (Array.isArray(saved)){
        const firstUser = saved.find(m => m && m.role === 'user' && (m.content||'').trim())
        if (firstUser && firstUser.content) title = firstUser.content.slice(0,60)
      }
      if (typeof onSessionUpdate === 'function'){
        onSessionUpdate({ id: sessionId, title, updatedAt: new Date().toISOString() })
      }
    }catch{}
  }, [sessionId])
  useEffect(() => {
    try{
      // Only store if there is at least one non-empty message
      const any = (messages || []).some(m => (m?.content || '').trim().length > 0)
      if (any){
        localStorage.setItem(`chat_${sessionId}`, JSON.stringify(messages))
      }
    }catch{}
  }, [messages, sessionId])

  function refreshSessions(){
    try{
      const raw = localStorage.getItem('chat_sessions')
      const arr = raw ? JSON.parse(raw) : []
      if (Array.isArray(arr)){
        arr.sort((a,b)=> new Date(b.updatedAt||0)-new Date(a.updatedAt||0))
        setSessions(arr)
      } else {
        setSessions([])
      }
    }catch{ setSessions([]) }
  }

  function removeSession(id){
    const confirm = window.confirm('Delete this chat? This will remove its local history.')
    if (!confirm) return
    try{
      localStorage.removeItem(`chat_${id}`)
      const raw = localStorage.getItem('chat_sessions')
      const arr = raw ? JSON.parse(raw) : []
      const next = Array.isArray(arr) ? arr.filter(s => s.id !== id) : []
      localStorage.setItem('chat_sessions', JSON.stringify(next))
      refreshSessions()
      if (id === sessionId && typeof onNewChat === 'function') onNewChat()
    }catch{}
  }

  function beginRename(s){
    setEditingId(s.id)
    setEditingTitle(s.title || 'New Chat')
  }
  function commitRename(){
    if (!editingId) return
    const nextTitle = (editingTitle || 'New Chat').trim().slice(0, 60)
    if (typeof onSessionUpdate === 'function'){
      onSessionUpdate({ id: editingId, title: nextTitle, updatedAt: new Date().toISOString() })
    }
    setEditingId(null)
    setEditingTitle('')
    refreshSessions()
  }
  function handleRenameKey(e){
    if (e.key === 'Enter') { e.preventDefault(); commitRename() }
    if (e.key === 'Escape') { setEditingId(null); setEditingTitle('') }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 fade-in-up">
      <div className="flex gap-6">
        {/* Left sidebar: History (always on the left, ChatGPT-like) */}
        <aside className="w-72 min-w-[15rem] shrink-0">
          <Card className="flex flex-col h-[calc(100vh-12rem)]">
            <div className="border-b px-4 py-3 flex items-center justify-between">
              <h2 className="font-semibold">History</h2>
              <Button size="sm" variant="outline" onClick={onNewChat}>New</Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground px-1">No chats yet</p>
              ) : (
                sessions.map(s => (
                  <div key={s.id} className={`group rounded-md border p-2 cursor-pointer ${s.id===sessionId ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`} onClick={()=> typeof onSelectSession==='function' && onSelectSession(s.id)}>
                    <div className="flex items-center justify-between gap-2">
                      {editingId === s.id ? (
                        <input
                          autoFocus
                          value={editingTitle}
                          onChange={(e)=>setEditingTitle(e.target.value)}
                          onKeyDown={handleRenameKey}
                          onBlur={commitRename}
                          className="w-full text-sm font-medium bg-transparent outline-none border-b border-[rgb(var(--accent-start))]"
                        />
                      ) : (
                        <div className="truncate text-sm font-medium" title={s.title || 'New Chat'}>{s.title || 'New Chat'}</div>
                      )}
                      <div className="flex items-center gap-1">
                        <button className="opacity-60 hover:opacity-100 text-xs" title="Rename" onClick={(e)=>{ e.stopPropagation(); beginRename(s) }}>✎</button>
                        <button className="opacity-60 hover:opacity-100 text-xs" title="Delete" onClick={(e)=>{ e.stopPropagation(); removeSession(s.id) }}>✕</button>
                      </div>
                    </div>
                    {s.updatedAt && (<div className="text-[11px] text-muted-foreground truncate">{new Date(s.updatedAt).toLocaleString()}</div>)}
                  </div>
                ))
              )}
            </div>
          </Card>
        </aside>

        {/* Main content: Chat like ChatGPT */}
        <main className="flex-1 min-w-0">
          <Card className="flex flex-col h-[calc(100vh-12rem)]">
            <div className="border-b px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <h2 className="font-semibold">Chat Session</h2>
                  <p className="text-sm text-muted-foreground truncate">Session: {sessionId.slice(0,8)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {/* LLM connection badge */}
                  <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs border ${llmOk === null ? 'text-slate-500 border-slate-300 dark:border-slate-600' : llmOk ? 'text-emerald-700 border-emerald-300 dark:text-emerald-300 dark:border-emerald-700' : 'text-rose-700 border-rose-300 dark:text-rose-300 dark:border-rose-700'}`}
                       title={llmOk ? (llmModel || model) : (llmReason || 'LLM unavailable')}>
                    <span className={`inline-block h-2 w-2 rounded-full ${llmOk === null ? 'bg-slate-300' : llmOk ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                    <span>{llmOk === null ? 'Checking LLM…' : (llmOk ? (llmModel || model) : 'LLM offline')}</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={onNewChat}>New Chat</Button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground py-12">
                  <p className="text-lg mb-2">Start a conversation</p>
                  <p className="text-sm">Ask questions about your uploaded documents</p>
                </div>
              )}

              {messages.map((m, idx) => (
                <div key={idx} className={`flex items-start gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`${m.role === 'user' ? 'accent-gradient text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100'} h-10 w-10 rounded-full flex items-center justify-center font-semibold shadow-md select-none`}>
                    {m.role === 'user' ? 'U' : 'AI'}
                  </div>
                  <div className={`${m.role === 'user' ? 'bg-[rgb(var(--accent-start))] text-white' : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700'} px-5 py-3 rounded-2xl shadow-sm max-w-[80%] whitespace-pre-wrap leading-relaxed`}
                       style={m.role === 'user' ? { backgroundImage: 'linear-gradient(135deg, rgb(var(--accent-start)), rgb(var(--accent-end)))' } : {}}>
                    {m.content}
                    {Array.isArray(m.citations) && m.citations.length > 0 && (
                      <div className="mt-3 text-xs text-slate-600 dark:text-slate-300 border-t pt-2">
                        Sources: {m.citations.map((c, i) => (<span key={i} className="mr-2">[{i+1}] {c.source}</span>))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isStreaming && (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <div className="typing-dots"><span></span><span></span><span></span></div>
                  <span className="text-sm">AI is thinking...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="border-t p-4">
              <div className="flex gap-2">
                <Input
                  value={userInput}
                  onChange={(e)=>setUserInput(e.target.value)}
                  onKeyDown={(e)=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMessage() } }}
                  placeholder="Ask about your documents..."
                  className="flex-1"
                />
                <Button onClick={sendMessage} disabled={isStreaming || !userInput.trim()} className="btn-accent"><Send className="h-4 w-4" /></Button>
                {isStreaming && (<Button variant="outline" onClick={()=>{ if (esRef.current) esRef.current.close(); setIsStreaming(false) }}><StopCircle className="h-4 w-4" /></Button>)}
              </div>
            </div>
          </Card>

          {/* Under chat: Citations and Settings */}
          <div className="grid gap-6 mt-6 grid-cols-1 md:grid-cols-2">
            <Card className="p-6">
              <h3 className="font-semibold mb-4">Citations</h3>
              {citations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Source citations will appear here when you chat</p>
              ) : (
                <ul className="space-y-3">
                  {citations.map((c, i) => (
                    <li key={i} className="text-sm border-l-2 border-[rgb(var(--accent-start))] pl-3">
                      <div className="font-medium">[{i + 1}] {c.source}</div>
                      <div className="text-muted-foreground text-xs">{c.preview}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold mb-4">Settings</h3>
              <div className="space-y-3 text-sm">
                <div><span className="text-muted-foreground">Model:</span> <span className="font-medium">{llmModel || model}</span></div>
                <div><span className="text-muted-foreground">Top-K:</span> <span className="font-medium">{topK}</span></div>
                <div><span className="text-muted-foreground">Persona:</span> <span className="font-medium capitalize">{persona}</span></div>
                <div className="flex items-center gap-2"><span className="text-muted-foreground">LLM:</span> <span className={`inline-flex items-center gap-1 ${llmOk===null? 'text-slate-500' : llmOk ? 'text-emerald-600' : 'text-rose-600'}`}><span className={`h-2 w-2 rounded-full ${llmOk===null? 'bg-slate-300' : llmOk ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>{llmOk===null? 'Unknown' : llmOk ? 'Connected' : 'Offline'}</span></div>
              </div>
            </Card>
          </div>
        </main>
      </div>
    </div>
  )
}
