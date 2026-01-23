import { Button } from '../ui/button'

interface DeclButtonProps {
  text?: string
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  onClick?: () => void
  className?: string
}

function DeclButton({ text, variant, size, onClick, className, ...props }: DeclButtonProps) {
  return (
    <Button variant={variant} size={size} onClick={onClick} className={className} {...props}>
      {text}
    </Button>
  )
}

export default DeclButton
export { DeclButton as Button }
