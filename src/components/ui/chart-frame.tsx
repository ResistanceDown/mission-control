'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

type ChartFrameProps = {
  className?: string
  minHeight?: number
  empty?: ReactNode
  children: (size: { width: number; height: number }) => ReactNode
}

export function ChartFrame({ className = '', minHeight = 256, empty = null, children }: ChartFrameProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const update = () => {
      const next = {
        width: Math.max(0, Math.floor(node.clientWidth)),
        height: Math.max(0, Math.floor(node.clientHeight)),
      }
      setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next))
    }

    update()
    const observer = new ResizeObserver(() => update())
    observer.observe(node)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  const ready = size.width > 0 && size.height > 0

  return (
    <div
      ref={ref}
      className={className}
      style={{ minHeight }}
    >
      {ready ? children(size) : empty}
    </div>
  )
}
