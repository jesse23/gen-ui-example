import {
  Field as FieldWrapper,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '../ui/field'
import { Input } from '../ui/input'
import { SelectTrigger } from '../ui/select'
import { Textarea } from '../ui/textarea'
import { Checkbox } from '../ui/checkbox'
import { cn } from '@/lib/utils'

export type PropertyType =
  | 'text'
  | 'password'
  | 'email'
  | 'number'
  | 'tel'
  | 'url'
  | 'selection'
  | 'textarea'
  | 'checkbox'

export interface SelectionOption {
  value: string
  label: string
}

export interface Property {
  type: PropertyType
  value?: unknown
  readOnly?: boolean
  valid?: boolean
  disabled?: boolean
  name: string
  placeholder?: string
  description?: string
  options?: SelectionOption[]
}

export interface DeclFieldProps {
  property: Property
  onChange?: (value: unknown) => void
  id?: string
  className?: string
}

function DeclField({ property, onChange, id: idProp, className }: DeclFieldProps) {
  const id = idProp ?? `field-${property.name.replace(/\s+/g, '-').toLowerCase()}`
  const invalid = property.valid === false
  const isCheckbox = property.type === 'checkbox'

  const handleChange = (value: unknown) => {
    onChange?.(value)
  }

  const renderControl = () => {
    if (property.readOnly) {
      return (
        <span
          className={cn(
            'block py-2 text-sm',
            invalid && 'text-destructive'
          )}
          aria-invalid={invalid}
        >
          {property.value === undefined || property.value === null
            ? '—'
            : String(property.value)}
        </span>
      )
    }

    switch (property.type) {
      case 'text':
      case 'password':
      case 'email':
      case 'number':
      case 'tel':
      case 'url':
        return (
          <Input
            id={id}
            type={property.type}
            value={property.value != null ? String(property.value) : ''}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={property.placeholder}
            disabled={property.disabled}
            readOnly={property.readOnly}
            aria-invalid={invalid}
            className={invalid ? 'border-destructive' : undefined}
          />
        )

      case 'selection':
        return (
          <SelectTrigger
            id={id}
            value={property.value != null ? String(property.value) : ''}
            onChange={(e) => handleChange(e.target.value)}
            disabled={property.disabled}
            aria-invalid={invalid}
            className={cn(invalid && 'border-destructive')}
          >
            {property.placeholder && (
              <option value="">{property.placeholder}</option>
            )}
            {(property.options ?? []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </SelectTrigger>
        )

      case 'textarea':
        return (
          <Textarea
            id={id}
            value={property.value != null ? String(property.value) : ''}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={property.placeholder}
            disabled={property.disabled}
            readOnly={property.readOnly}
            aria-invalid={invalid}
            className={cn('min-h-[80px] resize-none', invalid && 'border-destructive')}
          />
        )

      case 'checkbox':
        return (
          <Checkbox
            id={id}
            type="checkbox"
            checked={Boolean(property.value)}
            onChange={(e) => handleChange(e.target.checked)}
            disabled={property.disabled}
            aria-invalid={invalid}
            className={invalid ? 'border-destructive' : undefined}
          />
        )

      default:
        return (
          <Input
            id={id}
            type="text"
            value={property.value != null ? String(property.value) : ''}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={property.placeholder}
            disabled={property.disabled}
            aria-invalid={invalid}
            className={invalid ? 'border-destructive' : undefined}
          />
        )
    }
  }

  if (isCheckbox && !property.readOnly) {
    return (
      <FieldWrapper
        orientation="horizontal"
        data-invalid={invalid}
        className={cn('space-y-0', className)}
      >
        {renderControl()}
        <FieldLabel htmlFor={id} className="font-normal cursor-pointer">
          {property.name}
        </FieldLabel>
        {property.description && (
          <FieldDescription className="sr-only">
            {property.description}
          </FieldDescription>
        )}
        {invalid && (
          <FieldError>Validation failed</FieldError>
        )}
      </FieldWrapper>
    )
  }

  return (
    <FieldWrapper data-invalid={invalid} className={className}>
      {!isCheckbox && (
        <FieldLabel htmlFor={id}>{property.name}</FieldLabel>
      )}
      {renderControl()}
      {property.description && (
        <FieldDescription>{property.description}</FieldDescription>
      )}
      {invalid && (
        <FieldError>Validation failed</FieldError>
      )}
    </FieldWrapper>
  )
}

export default DeclField
export { DeclField as Field }
