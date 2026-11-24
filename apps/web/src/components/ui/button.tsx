import Link, { type LinkProps } from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-sm',
  secondary: 'border border-border-strong bg-surface text-fg hover:bg-surface-muted',
  danger: 'border border-negative/40 bg-surface text-negative hover:bg-negative-soft',
  ghost: 'text-muted hover:bg-surface-muted hover:text-fg',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string): string {
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant, size, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink<Route extends string>({
  variant,
  size,
  className,
  children,
  ...props
}: LinkProps<Route> & { variant?: Variant; size?: Size; className?: string; children: ReactNode }) {
  return (
    <Link className={buttonClass(variant ?? 'secondary', size, className)} {...props}>
      {children}
    </Link>
  );
}
