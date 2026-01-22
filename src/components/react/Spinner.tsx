
interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-[3px]',
  }

  return (
    <div className={`relative ${className}`}>
      <div
        className={`inline-block animate-spin rounded-full border-solid border-current border-r-transparent ${sizeClasses[size]}`}
        role="status"
        aria-label="Loading"
      >
        <span className="sr-only">Loading...</span>
      </div>
      {/* Optional: Add a pulsing effect */}
      <div
        className={`absolute inset-0 rounded-full border-solid border-current border-r-transparent opacity-20 animate-pulse ${sizeClasses[size]}`}
        aria-hidden="true"
      />
    </div>
  )
}

export default Spinner
