import React, { type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Form, FormItem } from './ui/form'
import { loadAction } from '../services/actions'
import { cn } from '@/lib/utils'

interface DeclFormProps {
  onSubmit?: string | ((data: any) => void | Promise<void>)
  children?: ReactNode | ReactNode[]
  className?: string
}

function DeclForm({ onSubmit, children, className, ...props }: DeclFormProps) {
  const form = useForm()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!onSubmit) return

    const formData = form.getValues()

    if (typeof onSubmit === 'string') {
      // Load action by name
      const action = loadAction(onSubmit)
      if (action) {
        await action(formData)
      }
    } else {
      // Call function directly
      await onSubmit(formData)
    }
  }

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
        onSubmit={handleSubmit}
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
