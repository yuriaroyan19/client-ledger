import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const controlClass =
  'block w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-fg shadow-xs placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 aria-invalid:border-negative aria-invalid:ring-negative/20 disabled:opacity-60';

interface FieldProps {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  className?: string;
  children: (props: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string }) => ReactNode;
}

/** Label + control + hint/error, wired for screen readers (aria-invalid / aria-describedby). */
export function Field({ label, error, hint, className, children }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const hasMessage = Boolean(error ?? hint);
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
      </label>
      {children({ id, ...(error && { 'aria-invalid': true }), ...(hasMessage && { 'aria-describedby': messageId }) })}
      {error ? (
        <p id={messageId} className="text-sm text-negative" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, 'h-10', className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClass, 'h-10 pr-8', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClass, 'min-h-24 py-2', className)} {...props} />;
}
