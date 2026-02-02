import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import ChatView from '@/components/ChatView'
import UploadView from '@/components/UploadView'
import AnalyticsView from '@/components/AnalyticsView'
import SettingsView from '@/components/SettingsView'
import ProfileModal from '@/components/ProfileModal'
import ProfileView from '@/components/ProfileView'
import SplashScreen from '@/components/SplashScreen'

export default function App(){
  const { toast } = useToast()
  const [activeView, setActiveView] = useState('home')
  const [showSplash, setShowSplash] = useState(true)
  const [darkMode, setDarkMode] = useState(false)
  const [theme, setTheme] = useState('Aurora')
  const [model, setModel] = useState('gpt-4o-mini')
  const [topK, setTopK] = useState(6)
  const [persona, setPersona] = useState('concise')
  const [sessionId, setSessionId] = useState('')
  const [userId, setUserId] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)

  useEffect(() => {
    // init session & user ids
    let sid = localStorage.getItem('session_id')
    if (!sid) { sid = (globalThis.crypto?.randomUUID?.() || `sess_${Math.random().toString(36).slice(2)}`); localStorage.setItem('session_id', sid) }
    setSessionId(sid)
    let uid = localStorage.getItem('user_id')
    if (!uid) { uid = (globalThis.crypto?.randomUUID?.() || `user_${Math.random().toString(36).slice(2)}`); localStorage.setItem('user_id', uid) }
    setUserId(uid)
    const dm = localStorage.getItem('dark_mode')
    if (dm === '1') { setDarkMode(true); document.documentElement.classList.add('dark') }
    const t = setTimeout(() => setShowSplash(false), 1300)
    return () => clearTimeout(t)
  }, [])

  // Simple hash-based routing so browser Back/Forward work and links are shareable
  useEffect(() => {
    const parseHash = () => {
      const h = (window.location.hash || '').replace(/^#\/?/, '')
      if (['home','chat','upload','analytics','settings','profile'].includes(h)) return h
      return 'home'
    }
    const initial = parseHash()
    setActiveView(initial)
    const onHash = () => setActiveView(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  function navigate(view){
    if (!view) return
    if (view === activeView) return
    // Update hash to create a real history entry
    window.location.hash = view
    setActiveView(view)
  }

  function goBack(){
    if (window.history.length > 1) {
      window.history.back()
    } else {
      navigate('home')
    }
  }

  // Apply theme (accent colors)
  useEffect(() => {
    const saved = localStorage.getItem('accent_theme')
    if (saved) {
      setTheme(saved)
      applyTheme(saved)
    } else {
      applyTheme(theme)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyTheme(name){
    // Use numeric RGB triplets to be compatible with rgb(var(--accent-*)) usage in CSS
    const root = document.documentElement
    const map = {
      // indigo → cyan
      Aurora:  ['99 102 241','6 182 212','99 102 241'],
      // pink → amber → red
      Sunset:  ['236 72 153','245 158 11','239 68 68'],
      // emerald → cyan
      Emerald: ['16 185 129','6 182 212','16 185 129'],
      // blue → cyan → indigo
      Ocean:   ['59 130 246','34 211 238','37 99 235'],
      // violet → indigo → purple
      Grape:   ['139 92 246','99 102 241','124 58 237'],
    }
    const [start,end,solid] = map[name] || map['Aurora']
    root.style.setProperty('--accent-start', start)
    root.style.setProperty('--accent-end', end)
    root.style.setProperty('--accent-solid', solid)
    localStorage.setItem('accent_theme', name)
  }

  useEffect(() => {
    if (darkMode) { document.documentElement.classList.add('dark'); localStorage.setItem('dark_mode', '1') }
    else { document.documentElement.classList.remove('dark'); localStorage.removeItem('dark_mode') }
  }, [darkMode])

  function getSessions(){
    try{ const raw = localStorage.getItem('chat_sessions'); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr : [] }catch{ return [] }
  }
  function setSessions(arr){
    try{ localStorage.setItem('chat_sessions', JSON.stringify(arr || [])) }catch{}
  }
  function upsertSessionMeta(meta){
    try{
      if (!meta || !meta.id) return
      const list = getSessions()
      const idx = list.findIndex(s => s.id === meta.id)
      const next = { id: meta.id, title: meta.title || 'New Chat', updatedAt: meta.updatedAt || new Date().toISOString() }
      if (idx >= 0) list[idx] = { ...list[idx], ...next }
      else list.push(next)
      setSessions(list)
    }catch{}
  }
  function selectSession(id){
    if (!id) return
    localStorage.setItem('session_id', id)
    setSessionId(id)
    window.location.hash = 'chat'
    setActiveView('chat')
  }
  function handleNewChat(){
    const sid = (globalThis.crypto?.randomUUID?.() || `sess_${Math.random().toString(36).slice(2)}`)
    localStorage.setItem('session_id', sid)
    setSessionId(sid)
    // create initial meta so it appears immediately in sidebar
    upsertSessionMeta({ id: sid, title: 'New Chat', updatedAt: new Date().toISOString() })
    // navigate to chat view to focus the new session immediately
    window.location.hash = 'chat'
    setActiveView('chat')
    toast({ title: 'New chat session started' })
  }

  // no-op here; individual views fetch as needed

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100 theme-transition">
      {/* Top animated gradient strip */}
  <div className="top-gradient-bar h-1 w-full"></div>
  {/* Ambient accent backdrop */}
  <div className="bg-ambient"></div>
      {showSplash && <SplashScreen onClose={() => setShowSplash(false)} />}
      {/* Header */}
      <header className="border-b bg-white dark:bg-slate-800 theme-transition">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          {/* Left: Brand */}
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => window.location.reload()} className="flex items-center gap-3 group" title="Reload">
              <div className="h-10 w-10 rounded-lg accent-gradient flex items-center justify-center text-white font-semibold shadow-sm">V</div>
            </button>
            <div className="hidden sm:block">
              <h1 className="text-base font-semibold leading-5">Vibe RAG</h1>
              <p className="text-xs text-slate-500">Chat with PDFs</p>
            </div>
          </div>

          {/* Center: Nav pills */}
          <nav className="flex items-center gap-4">
            {['home','chat','upload','analytics'].map((v) => {
              const label = v === 'home' ? 'Home' : v.charAt(0).toUpperCase() + v.slice(1)
              const active = activeView === v
              return (
                <button key={v} onClick={() => navigate(v)} className={`px-4 py-2 rounded-full text-sm font-medium transition ${active ? 'bg-[rgb(var(--accent-start))] text-white shadow-md' : 'text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                  {label}
                </button>
              )
            })}
          </nav>

          {/* Right: actions */}
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={handleNewChat} className="hidden md:inline-flex">
              <span className="text-lg leading-none">＋</span>
              <span className="text-sm hidden md:inline">New Chat</span>
            </Button>
            <button onClick={()=>navigate('settings')} title="Settings" aria-label="Open settings" className="h-10 w-10 inline-flex items-center justify-center rounded-md border hover:bg-slate-50 dark:hover:bg-slate-700 theme-transition">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M11.983 7.5a4.5 4.5 0 1 0 .034 9 4.5 4.5 0 0 0-.034-9Zm0-5.25a1 1 0 0 1 .94.658l.681 1.83a8.03 8.03 0 0 1 1.95.806l1.915-.84a1 1 0 0 1 1.217.36l1.5 2.121a1 1 0 0 1-.168 1.312l-1.492 1.249c.124.64.124 1.3 0 1.94l1.492 1.249a1 1 0 0 1 .168 1.312l-1.5 2.121a1 1 0 0 1-1.217.36l-1.915-.84a8.03 8.03 0 0 1-1.95.806l-.68 1.83a1 1 0 0 1-.941.658h-2.5a1 1 0 0 1-.94-.658l-.681-1.83a8.03 8.03 0 0 1-1.95-.806l-1.915.84a1 1 0 0 1-1.217-.36L1.68 13.5a1 1 0 0 1 .168-1.312l1.492-1.249a6.04 6.04 0 0 1 0-1.94L1.848 7.75A1 1 0 0 1 1.68 6.438l1.5-2.121a1 1 0 0 1 1.217-.36l1.915.84c.62-.345 1.273-.626 1.95-.806l.68-1.83A1 1 0 0 1 9.483 2.25h2.5Z"/></svg>
            </button>
            <button onClick={() => navigate('profile')} title="Profile" aria-label="Open profile" className="h-10 px-3 inline-flex items-center gap-2 rounded-md border hover:bg-slate-50 dark:hover:bg-slate-700 theme-transition">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm-7 9a7 7 0 1 1 14 0H5Z"/></svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      {activeView === 'home' && (
        <main className="mx-auto max-w-7xl px-6 py-16 fade-in-up">
          <div className="text-center mb-12">
            <h2 className="text-5xl font-extrabold text-[rgb(var(--accent-start))] mb-4">AI Document Search</h2>
            <p className="text-lg text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">Upload PDFs and chat with them using advanced RAG technology. Get instant answers with source citations.</p>
          </div>

          <div className="grid gap-8 grid-cols-1 md:grid-cols-3">
            <Card className="p-8 rounded-xl shadow-sm hover:shadow-lg transition-all border cursor-pointer">
              <div className="w-12 h-12 rounded-lg accent-gradient flex items-center justify-center text-white mb-4">📄</div>
              <h3 className="text-xl font-semibold mb-2">Upload Documents</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">Upload PDF files and we'll process them for intelligent search and retrieval.</p>
              <div><Button className="btn-accent" onClick={()=>navigate('upload')}>Get Started</Button></div>
            </Card>

            <Card className="p-8 rounded-xl shadow-sm hover:shadow-lg transition-all border cursor-pointer">
              <div className="w-12 h-12 rounded-lg accent-gradient flex items-center justify-center text-white mb-4">💬</div>
              <h3 className="text-xl font-semibold mb-2">Chat Interface</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">Ask questions and get answers powered by AI with citations from your documents.</p>
              <div><Button className="btn-accent" onClick={()=>navigate('chat')}>Start Chatting</Button></div>
            </Card>

            <Card className="p-8 rounded-xl shadow-sm hover:shadow-lg transition-all border cursor-pointer">
              <div className="w-12 h-12 rounded-lg accent-gradient flex items-center justify-center text-white mb-4">📊</div>
              <h3 className="text-xl font-semibold mb-2">Analytics</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">Track your usage, view statistics, and monitor your document library.</p>
              <div><Button className="btn-accent" onClick={()=>navigate('analytics')}>View Stats</Button></div>
            </Card>
          </div>
        </main>
      )}

      {activeView === 'chat' && (
        <ChatView
          sessionId={sessionId}
          userId={userId}
          model={model}
          topK={topK}
          persona={persona}
          onNewChat={handleNewChat}
          onSessionUpdate={upsertSessionMeta}
          onSelectSession={selectSession}
        />
      )}

  {activeView === 'upload' && (<UploadView userId={userId} />)}

      {activeView === 'analytics' && (<AnalyticsView userId={userId} />)}

      {activeView === 'settings' && (
        <SettingsView
          model={model}
          setModel={setModel}
          topK={topK}
          setTopK={setTopK}
          persona={persona}
          setPersona={setPersona}
          theme={theme}
          setTheme={(t)=>{ setTheme(t); applyTheme(t) }}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
        />
      )}

      {activeView === 'profile' && (
        <ProfileView userId={userId} onBack={()=> { if (window.history.length > 1) window.history.back(); else navigate('home') }} />
      )}

      {/* Profile Modal */}
      {/* Modal no longer used; keeping import for potential future */}
    </div>
  )
}
