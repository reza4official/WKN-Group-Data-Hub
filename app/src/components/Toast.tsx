/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

type Item = { id: number; text: string }
type Ctx = { toast: (text: string) => void }

const ToastContext = createContext<Ctx>({ toast: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([])
  const next = useRef(1)
  const toast = useCallback((text: string) => {
    const id = next.current++
    setItems((l) => [...l, { id, text }])
    window.setTimeout(() => setItems((l) => l.filter((i) => i.id !== id)), 3400)
  }, [])
  const value = useMemo(() => ({ toast }), [toast])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className="toast">
            {i.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
