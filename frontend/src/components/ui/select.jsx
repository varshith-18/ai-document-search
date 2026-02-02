import React, { createContext, useContext, useState } from 'react'

const Ctx = createContext({ value: undefined, setValue: () => {} })

export function Select({ value, onValueChange, children }){
  const [internal, setInternal] = useState(value)
  const setValue = (v) => {
    setInternal(v)
    onValueChange?.(v)
  }
  return <Ctx.Provider value={{ value: value ?? internal, setValue }}>{children}</Ctx.Provider>
}

export function SelectTrigger({ className = '', children }){
  return <div className={`inline-flex items-center border rounded-md px-2 py-1 ${className}`}>{children}</div>
}
export function SelectValue({ placeholder }){
  const { value } = useContext(Ctx)
  return <span className="text-sm">{value ?? placeholder}</span>
}
export function SelectContent({ className = '', children }){
  return <div className={`mt-1 border rounded-md bg-white dark:bg-slate-800 ${className}`}>{children}</div>
}
export function SelectItem({ value, children, className = '', onSelect }){
  const { setValue } = useContext(Ctx)
  return (
    <div role="option" onClick={() => { setValue(value); onSelect?.(value) }} className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 ${className}`}>
      {children}
    </div>
  )
}

export default { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
