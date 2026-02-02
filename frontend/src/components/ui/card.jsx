import React from 'react'

export function Card({ className = '', children, ...props }){
  return (
    <div className={`bg-white dark:bg-slate-800 border rounded-xl shadow-sm ${className}`} {...props}>
      {children}
    </div>
  )
}
export default Card
