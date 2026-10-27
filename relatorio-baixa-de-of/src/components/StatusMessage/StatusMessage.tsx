import './StatusMessage.css'

interface StatusMessageProps {
  message: string
  isError: boolean
}

export function StatusMessage({ message, isError }: StatusMessageProps) {
  return (
    <div className={`status${isError ? ' status-error' : ''}`} role="status" aria-live="polite">
      {message}
    </div>
  )
}
