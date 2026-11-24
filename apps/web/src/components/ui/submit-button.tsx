'use client';

import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from './button';

/** Disables itself and shows progress while its parent form's action is pending (no double submits). */
export function SubmitButton({
  children,
  pendingLabel,
  confirmMessage,
  onClick,
  ...props
}: ButtonProps & { pendingLabel?: string; confirmMessage?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      {...props}
      type="submit"
      disabled={pending || props.disabled}
      aria-busy={pending || undefined}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
        onClick?.(event);
      }}
    >
      {pending ? (
        <>
          <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
          {pendingLabel ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
