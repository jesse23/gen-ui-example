import type { ReactNode } from 'react'

interface ExistWhenProps {
  condition: boolean
  children: ReactNode
}

function ExistWhen({ condition, children }: ExistWhenProps) {
  return condition ? <>{children}</> : null
}

export default ExistWhen
export { ExistWhen }

