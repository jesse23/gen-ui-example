import { Label } from './ui/label'

interface DeclLabelProps {
  text?: string
  htmlFor?: string
  className?: string
}

function DeclLabel({ text, htmlFor, className, ...props }: DeclLabelProps) {
  return (
    <Label htmlFor={htmlFor} className={className} {...props}>
      {text}
    </Label>
  )
}

export default DeclLabel
export { DeclLabel as Label }
