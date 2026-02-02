import React, { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

export default function ProfileModal({ userId, isOpen, onClose }){
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isOpen) return
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
  }, [isOpen, userId])

  if (!isOpen) return null

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">User Profile</h2>
            <p className="text-sm text-muted-foreground font-mono">{userId.slice(0,16)}...</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="typing-dots inline-flex"><span></span><span></span><span></span></div>
          </div>
        ) : profile ? (
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="font-semibold mb-3">Usage Split</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={usageData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} stroke="none">
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
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={totalsData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
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
        ) : (
          <p className="text-center text-muted-foreground py-12">No profile data available</p>
        )}
      </Card>
    </div>
  )
}
