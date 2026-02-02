import React, { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export default function AnalyticsView({ userId }){
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simulate backend fetch per provided snippet
    const t = setTimeout(() => {
      setProfile({
        queries: 0,
        llm_queries: 0,
        uploads: 0,
        sessions: 1,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      })
      setLoading(false)
    }, 500)
    return () => clearTimeout(t)
  }, [userId])

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 text-center">
        <div className="typing-dots inline-flex"><span></span><span></span><span></span></div>
      </div>
    )
  }

  const usageData = [
    { name: 'LLM Queries', value: profile?.llm_queries || 0 },
    { name: 'Retrieval Only', value: Math.max((profile?.queries || 0) - (profile?.llm_queries || 0), 0) },
  ]
  const totalsData = [
    { name: 'Queries', value: profile?.queries || 0 },
    { name: 'Uploads', value: profile?.uploads || 0 },
    { name: 'Sessions', value: profile?.sessions || 0 },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 fade-in-up">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2">Analytics Dashboard</h2>
        <p className="text-muted-foreground">Track your usage and activity</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 mb-6">
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Usage Split</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={usageData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} stroke="none">
                  <Cell fill="rgb(99, 102, 241)" />
                  <Cell fill="rgb(6, 182, 212)" />
                </Pie>
                <Legend verticalAlign="bottom" height={36} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold mb-4">Activity Totals</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={totalsData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="rgb(34, 197, 94)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-6">
          <div className="text-sm text-muted-foreground mb-1">Total Queries</div>
          <div className="text-3xl font-bold">{profile?.queries || 0}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm text-muted-foreground mb-1">Documents Uploaded</div>
          <div className="text-3xl font-bold">{profile?.uploads || 0}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm text-muted-foreground mb-1">Sessions</div>
          <div className="text-3xl font-bold">{profile?.sessions || 0}</div>
        </Card>
      </div>
    </div>
  )
}
