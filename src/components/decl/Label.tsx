import { Label } from '../ui/label'

interface DeclLabelProps {
  text?: unknown
  htmlFor?: string
  className?: string
}

function DeclLabel({ text, htmlFor, className, ...props }: DeclLabelProps) {
  // If text is a string, use it as-is; otherwise stringify it
  const displayText = typeof text === 'string' 
    ? text 
    : (text !== undefined && text !== null ? JSON.stringify(text) : text)
  
  return (
    <Label htmlFor={htmlFor} className={className} {...props}>
      {displayText}
    </Label>
  )
}

export default DeclLabel
export { DeclLabel as Label }
