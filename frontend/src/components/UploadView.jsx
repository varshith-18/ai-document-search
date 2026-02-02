import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Upload, File, CheckCircle2, Trash2, RefreshCcw } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function UploadView({ userId }){
  const { toast } = useToast()
  const API = (import.meta?.env?.VITE_API_BASE) || 'http://127.0.0.1:8000'
  const [file, setFile] = useState(null)
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedDocs, setUploadedDocs] = useState([])
  const [indexedDocs, setIndexedDocs] = useState([])
  const [groupedDocs, setGroupedDocs] = useState([])
  const [indexLoading, setIndexLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  function handleDrop(e){
    e.preventDefault()
    setDragOver(false)
    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile && droppedFile.type === 'application/pdf') {
      setFile(droppedFile)
    } else {
      toast({ title:'Invalid file type', description:'Please upload a PDF file', variant:'destructive' })
    }
  }

  function openFilePicker(){
    try{ fileInputRef.current?.click() }catch{}
  }

  async function handleUpload(){
    if (!file) return
    setUploading(true)
    try{
      const fd = new FormData()
      fd.append('file', file)
      // Optional tuning; keep backend defaults if not provided
      // fd.append('chunk_size', String(500))
      // fd.append('overlap', String(50))
      if (userId) fd.append('user_id', String(userId))

      const res = await fetch(`${API}/upload`, {
        method: 'POST',
        body: fd,
      })
      if(!res.ok){
        const txt = await res.text().catch(()=> '')
        throw new Error(`Upload failed: ${res.status} ${txt}`)
      }
      const j = await res.json().catch(()=> ({}))
      const chunks = Number(j.ingested_chunks || 0)
      setUploadedDocs(prev => [{ name: file.name, chunks: chunks || undefined }, ...prev])
      setFile(null)
      toast({ title: 'Uploaded', description: chunks ? `${chunks} chunks ingested` : 'File uploaded' })
      setStatusMsg({ type: 'success', text: chunks ? `${chunks} chunks ingested` : 'File uploaded' })
      // Refresh server index list
      await fetchIndex()
    }catch(e){
      toast({ title:'Upload failed', description: String(e), variant:'destructive' })
      setStatusMsg({ type: 'error', text: String(e) })
    }finally{
      setUploading(false)
    }
  }

  async function fetchIndex(){
    try{
      setIndexLoading(true)
      // Prefer grouped endpoint for accurate per-PDF counts
      let grouped = []
      try{
        const r1 = await fetch(`${API}/index_grouped`)
        if (r1.ok){
          const g = await r1.json()
          grouped = (g.items || []).map(it => ({ source: it.source, count: it.count }))
        }
      }catch{}
      if (grouped.length === 0){
        // Fallback: fetch limited samples and group client-side (approximate)
        const res = await fetch(`${API}/index`)
        if(!res.ok) throw new Error(`Index fetch failed: ${res.status}`)
        const j = await res.json()
        const samples = j.samples || []
        setIndexedDocs(samples)
        const map = new Map()
        for (const s of samples){
          const k = s.source || 'Unknown'
          map.set(k, (map.get(k) || 0) + 1)
        }
        grouped = Array.from(map.entries()).map(([source, count]) => ({ source, count }))
      }
      setGroupedDocs(grouped)
    }catch(e){
      toast({ title: 'Failed to fetch index', description: String(e), variant: 'destructive' })
    }finally{
      setIndexLoading(false)
    }
  }

  useEffect(() => { fetchIndex() }, [])

  async function deleteIndexedDoc(doc){
    const id = doc.id || doc.doc_id || doc.source_id
    const source = doc.source || doc.path || doc.file_path || doc.file || doc.name
    if (!id && !source){
      toast({ title:'Cannot remove', description:'No document identifier found (id/source missing)', variant:'destructive' })
      return
    }
    const confirm = window.confirm('Remove this document from the server index?')
    if (!confirm) return
    try{
      const headers = { 'Content-Type': 'application/json' }
      const tries = [
        { url: `${API}/delete?id=${encodeURIComponent(id || '')}`, opts: { method: 'DELETE' }, guard: !!id },
        { url: `${API}/delete?source=${encodeURIComponent(source || '')}`, opts: { method: 'DELETE' }, guard: !!source },
        { url: `${API}/delete`, opts: { method: 'POST', headers, body: JSON.stringify({ id }) }, guard: !!id },
        { url: `${API}/delete`, opts: { method: 'POST', headers, body: JSON.stringify({ source }) }, guard: !!source },
        { url: `${API}/remove?id=${encodeURIComponent(id || '')}`, opts: { method: 'DELETE' }, guard: !!id },
        { url: `${API}/remove`, opts: { method: 'POST', headers, body: JSON.stringify({ id }) }, guard: !!id },
        { url: `${API}/remove`, opts: { method: 'POST', headers, body: JSON.stringify({ source }) }, guard: !!source },
        { url: `${API}/index/delete?id=${encodeURIComponent(id || '')}`, opts: { method: 'DELETE' }, guard: !!id },
        { url: `${API}/index/delete`, opts: { method: 'POST', headers, body: JSON.stringify({ id }) }, guard: !!id },
      ]

      let lastStatus = 0
      for (const t of tries){
        if(!t.guard) continue
        const res = await fetch(t.url, t.opts)
        lastStatus = res.status
        if (res.ok){
          toast({ title: 'Removed', description: 'Document removed from index' })
          await fetchIndex()
          return
        }
      }
      throw new Error(`Delete failed after multiple attempts (last status ${lastStatus})`)
    }catch(e){
      toast({ title:'Failed to remove', description:String(e), variant:'destructive' })
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12 fade-in-up">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs mb-3">
          <span className="inline-block h-2 w-2 rounded-full bg-[rgb(var(--accent-start))]"></span>
          <span className="text-muted-foreground">Step 1</span>
          <span className="font-medium">Upload PDFs</span>
        </div>
        <h2 className="text-3xl font-bold mb-2">Upload PDF Documents</h2>
        <p className="text-muted-foreground">Upload PDFs to enable AI-powered search and chat</p>
      </div>

      <Card className="p-8 mb-8 shadow-sm">
        {statusMsg && (
          <div className={`mb-4 text-sm rounded-md p-3 ${statusMsg.type==='success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {statusMsg.text}
          </div>
        )}
        <div
          onClick={openFilePicker}
          onDragOver={(e)=>{ e.preventDefault(); setDragOver(true) }}
          onDragLeave={()=>setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${dragOver ? 'border-[rgb(var(--accent-start))] bg-slate-50 dark:bg-slate-800/50' : 'hover:border-[rgb(var(--accent-start))] hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
        >
          <div className="mx-auto w-16 h-16 rounded-full accent-gradient flex items-center justify-center mb-4 shadow-md">
            <Upload className="h-8 w-8 text-white" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Drag & drop your PDF here</h3>
          <p className="text-sm text-muted-foreground mb-4">or click to browse files</p>
          <input ref={fileInputRef} type="file" accept="application/pdf" onChange={(e)=>setFile(e.target.files?.[0] || null)} className="hidden" id="file-upload" />
          <Button variant="outline" className="cursor-pointer hover:shadow-sm" onClick={(e)=>{ e.stopPropagation(); openFilePicker(); }}>
            <span>Browse Files</span>
          </Button>
        </div>

        {file && (
          <div className="mt-6 flex items-center justify-between p-4 bg-slate-100 dark:bg-slate-800 rounded-lg border">
            <div className="flex items-center gap-3">
              <File className="h-8 w-8 text-[rgb(var(--accent-start))]" />
              <div>
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">{(file.size/1024/1024).toFixed(2)} MB</p>
              </div>
            </div>
            <Button onClick={handleUpload} disabled={uploading} className="btn-accent">
              {uploading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin"></span>
                  Uploading...
                </span>
              ) : 'Upload'}
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-6 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold">Uploaded Documents</h3>
          <div className="text-xs text-muted-foreground">Local only</div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">This list is local to your browser session. Use the section below to manage server-indexed documents.</p>
        {uploadedDocs.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-10">
            <div className="mb-2">No documents uploaded yet</div>
            <div className="text-xs">Drag a PDF above or click Browse Files</div>
          </div>
        ) : (
          <div className="space-y-3">
            {uploadedDocs.map((doc, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-slate-50 dark:bg-slate-800/50 hover:shadow-sm transition">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div className="flex-1">
                  <p className="font-medium">{doc.name}</p>
                  <p className="text-xs text-muted-foreground">{doc.chunks} chunks indexed</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => {
                  setUploadedDocs(prev => prev.filter((_, idx) => idx !== i))
                  toast({ title: 'Removed', description: `${doc.name} removed from list` })
                }}>Remove</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Indexed docs from server with remove option */}
      <Card className="p-6 mt-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Indexed Documents (Server)</h3>
          <Button variant="outline" size="sm" onClick={fetchIndex} disabled={indexLoading}>
            <RefreshCcw className="h-4 w-4 mr-2" /> {indexLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
        {groupedDocs.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-10">
            <div className="mb-1">No documents indexed on server</div>
            <div className="text-xs">Upload a PDF above to get started</div>
          </div>
        ) : (
          <div className="space-y-3">
            {groupedDocs.map((d, i) => (
              <div key={d.source || i} className="flex items-center gap-3 p-3 rounded-lg border bg-slate-50 dark:bg-slate-800/50 hover:shadow-sm transition">
                <div className="flex-1 overflow-hidden">
                  <p className="font-medium truncate">{d.source ?? `doc#${i+1}`}</p>
                  <p className="text-xs text-muted-foreground">{d.count ?? 0} chunks</p>
                </div>
                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/20" onClick={() => deleteIndexedDoc(d)}>
                  <Trash2 className="h-4 w-4 mr-1" /> Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
