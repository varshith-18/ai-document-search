import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export default function ProfileView({ userId: propUserId, onBack }){
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(propUserId || '')

  useEffect(() => {
    const uid = propUserId || localStorage.getItem('user_id') || ''
    setUserId(uid)
    // Stubbed data to match provided spec/screenshot
    const t = setTimeout(() => {
      setProfile({
        queries: 0,
        llm_queries: 0,
        uploads: 0,
        sessions: 1,
        first_seen: new Date().toISOString().split('T')[0],
        last_seen: new Date().toISOString().split('T')[0],
      })
      setLoading(false)
    }, 500)
    return () => clearTimeout(t)
  }, [propUserId])

  const usageData = profile ? [
    { name: 'LLM Queries', value: profile.llm_queries || 0 },
    { name: 'Retrieval', value: Math.max((profile.queries || 0) - (profile.llm_queries || 0), 0) },
  ] : []

  const totalsData = profile ? [
    { name: 'Queries', value: profile.queries || 0 },
    { name: 'Uploads', value: profile.uploads || 0 },
    { name: 'Sessions', value: profile.sessions || 0 },
  ] : []

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100 theme-transition">
      <div className="top-gradient-bar h-1 w-full" />
      <div className="bg-ambient" />

      <header className="relative z-10 border-b bg-white/80 backdrop-blur-sm dark:bg-slate-800/80 theme-transition">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold leading-none">User Profile</h1>
            <p className="text-xs text-muted-foreground">View your usage statistics and activity</p>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 py-8 fade-in-up">
        <Card className="p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-2">Profile Information</h2>
            <p className="text-sm text-muted-foreground font-mono">{(userId || '').slice(0,32)}...</p>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="typing-dots inline-flex"><span></span><span></span><span></span></div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="font-semibold mb-3">Usage Split</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={usageData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} stroke="none">
                          <Cell fill="rgb(99, 102, 241)" />
                          <Cell fill="rgb(6, 182, 212)" />
                        </Pie>
                        <Legend verticalAlign="bottom" height={24} />
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Activity Totals</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={totalsData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="rgb(34, 197, 94)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Queries:</span><span className="font-semibold">{profile.queries}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">LLM Queries:</span><span className="font-semibold">{profile.llm_queries}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Uploads:</span><span className="font-semibold">{profile.uploads}</span></div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Sessions:</span><span className="font-semibold">{profile.sessions}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">First Seen:</span><span className="font-semibold">{profile.first_seen}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Last Seen:</span><span className="font-semibold">{profile.last_seen}</span></div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </main>
    </div>
  )
}
