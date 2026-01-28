import { Input } from '../ui/input'
import { FieldLabel } from '../ui/field'
import { cn } from '@/lib/utils'

interface DeclTextBoxProps {
  value?: string
  onChange?: (value: string) => void
  label?: string
  placeholder?: string
  className?: string
  type?: string
  id?: string
}

function DeclTextBox({ value, onChange, label, placeholder, className, type = 'text', id: idProp, ...props }: DeclTextBoxProps) {
  const id = idProp ?? (label ? `field-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined)
  const input = (
    <Input
      {...props}
      id={id}
      type={type}
      value={value || ''}
      onChange={(e) => {
        if (onChange) {
          onChange(e.target.value)
        }
      }}
      placeholder={placeholder}
      className={className}
    />
  )
  if (label) {
    return (
      <div className={cn('space-y-2')}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {input}
      </div>
    )
  }
  return input
}

export default DeclTextBox
export { DeclTextBox as TextBox }
