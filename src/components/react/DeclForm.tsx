import React, { type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Form, FormItem } from '../ui/form'
import { cn } from '@/lib/utils'

interface DeclFormProps {
  children?: ReactNode | ReactNode[]
  className?: string
}

function DeclForm({ children, className, ...props }: DeclFormProps) {
  const form = useForm()


  // Wrap each child in FormItem (Field component) with spacing
  const wrappedChildren = React.Children.map(children, (child, index) => {
    if (child == null) return null
    
    return (
      <FormItem key={index} className="mb-4">
        {child}
      </FormItem>
    )
  })

  return (
    <Form {...form}>
      <form
        className={cn('space-y-4', className)}
        {...props}
      >
        {wrappedChildren}
      </form>
    </Form>
  )
}

export default DeclForm
export { DeclForm as Form }
