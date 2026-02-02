import React from 'react'

export function Input({ className = '', ...props }){
  return (
    <input className={`w-full rounded-md border px-3 py-2 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`} {...props} />
  )
}
export default Input
