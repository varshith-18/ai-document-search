import React from 'react'
import { Card } from '@/components/ui/card'

export default function SettingsView({ model, setModel, topK, setTopK, persona, setPersona, theme, setTheme, darkMode, setDarkMode }){
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12 fade-in-up">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2">Settings</h2>
        <p className="text-muted-foreground">Customize your experience</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <h3 className="font-semibold mb-6">AI Configuration</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="model" className="mb-2 block">AI Model</label>
              <select id="model" value={model} onChange={e=>setModel(e.target.value)} className="border rounded-md px-2 py-2 w-full">
                <option value="gpt-4o-mini">gpt-4o-mini</option>
                <option value="gpt-3.5-turbo-0125">gpt-3.5-turbo-0125</option>
                <option value="gpt-4-turbo">gpt-4-turbo</option>
              </select>
            </div>

            <div>
              <label htmlFor="topk" className="mb-2 block">Top-K Retrieval</label>
              <select id="topk" value={String(topK)} onChange={(e)=>setTopK(parseInt(e.target.value))} className="border rounded-md px-2 py-2 w-full">
                {[2,3,4,5,6,7,8,9,10].map(k => <option key={k} value={k}>{k} documents</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="persona" className="mb-2 block">Response Style</label>
              <select id="persona" value={persona} onChange={e=>setPersona(e.target.value)} className="border rounded-md px-2 py-2 w-full">
                <option value="concise">Concise</option>
                <option value="bullets">Bullet Points</option>
                <option value="step-by-step">Step-by-Step</option>
                <option value="formal">Formal</option>
              </select>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold mb-6">Appearance</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="theme" className="mb-2 block">Color Theme</label>
              <select id="theme" value={theme} onChange={e=>setTheme(e.target.value)} className="border rounded-md px-2 py-2 w-full">
                {['Aurora','Sunset','Emerald','Ocean','Grape'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="flex items-center justify-between">
              <label htmlFor="darkmode">Dark Mode</label>
              <input id="darkmode" type="checkbox" checked={darkMode} onChange={()=>setDarkMode(d=>!d)} className="h-4 w-4" />
            </div>

            <div className="pt-4">
              <p className="text-sm text-muted-foreground">Choose your preferred color theme and toggle dark mode for comfortable viewing.</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
