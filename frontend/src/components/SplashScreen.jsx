import React from 'react'
import { Button } from '@/components/ui/button'

export default function SplashScreen({ onClose }){
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center splash-gradient text-white">
      <div className="text-center px-6">
        <div className="text-4xl md:text-6xl font-bold splash-title mb-4 animate-[fadeUp_.6s_ease_forwards]">AI Document Search</div>
        <div className="text-base md:text-lg text-white/90 mb-8 animate-[fadeUp_.8s_ease_forwards]">Chat with your PDFs • RAG + Streaming • Powered by AI</div>
        <Button onClick={onClose} className="bg-white/10 hover:bg-white/20 border-2 border-white/30 text-white backdrop-blur-sm animate-[fadeUp_1s_ease_forwards]">Enter Application</Button>
      </div>
    </div>
  )
}
