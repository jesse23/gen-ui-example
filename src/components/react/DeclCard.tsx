import { type ReactNode } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../ui/card'

interface DeclCardProps {
  title?: string
  description?: string
  action?: ReactNode | ReactNode[] | string[]
  content?: ReactNode | ReactNode[] | string[]
  footer?: ReactNode | ReactNode[] | string[]
  className?: string
  children?: ReactNode | ReactNode[]
}

function DeclCard({
  title,
  description,
  action,
  content,
  footer,
  className,
  children,
  ...props
}: DeclCardProps) {
  // If children are provided, they are the content (for backward compatibility)
  const cardContent = content || children

  // Normalize arrays to ReactNode arrays
  const normalizeChildren = (nodes: ReactNode | ReactNode[] | undefined): ReactNode[] => {
    if (!nodes) return []
    if (Array.isArray(nodes)) return nodes.filter(node => node != null)
    return [nodes]
  }

  const actionNodes = normalizeChildren(action)
  const contentNodes = normalizeChildren(cardContent)
  const footerNodes = normalizeChildren(footer)

  return (
    <Card className={className} {...props}>
      {(title || description || actionNodes.length > 0) && (
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
          {actionNodes.length > 0 && (
            <div className="flex items-center justify-end mt-2">
              {actionNodes}
            </div>
          )}
        </CardHeader>
      )}
      {contentNodes.length > 0 && (
        <CardContent>
          {contentNodes}
        </CardContent>
      )}
      {footerNodes.length > 0 && (
        <CardFooter>
          {footerNodes}
        </CardFooter>
      )}
    </Card>
  )
}

export default DeclCard
export { DeclCard as Card }
