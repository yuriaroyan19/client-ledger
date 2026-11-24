import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatMoney, formatSignedMoney, toneOf } from '@/lib/format';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-surface shadow-xs', className)} {...props} />;
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type BadgeTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'accent';

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-muted',
  positive: 'bg-positive-soft text-positive',
  negative: 'bg-negative-soft text-negative',
  warning: 'bg-warning-soft text-warning',
  accent: 'bg-accent-soft text-accent',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', badgeTones[tone])}>
      {children}
    </span>
  );
}

const amountTones = { positive: 'text-positive', negative: 'text-negative', neutral: 'text-fg' } as const;

/** Money with colour AND sign, so meaning never depends on colour alone (accessibility). */
export function Amount({ value, signed = false, className }: { value: string; signed?: boolean; className?: string }) {
  return (
    <span className={cn('tabular font-medium', amountTones[toneOf(value)], className)}>
      {signed ? formatSignedMoney(value) : formatMoney(value)}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm text-muted">{eyebrow}</div>}
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <div className="mt-1 text-sm text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="px-5 py-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold">{children}</dd>
      {hint && <dd className="mt-1 text-xs text-muted">{hint}</dd>}
    </Card>
  );
}

export function Alert({ tone = 'negative', children }: { tone?: 'negative' | 'warning' | 'positive'; children: ReactNode }) {
  const tones = {
    negative: 'border-negative/30 bg-negative-soft text-negative',
    warning: 'border-warning/30 bg-warning-soft text-warning',
    positive: 'border-positive/30 bg-positive-soft text-positive',
  };
  return (
    <div role={tone === 'negative' ? 'alert' : 'status'} className={cn('rounded-lg border px-4 py-3 text-sm', tones[tone])}>
      {children}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div aria-hidden className="mb-3 grid size-10 place-items-center rounded-full bg-surface-muted text-muted">
        ∅
      </div>
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Table({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  align = 'left',
  className,
}: {
  children?: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-border bg-surface-muted/60 px-5 py-2.5 text-xs font-medium tracking-wide text-muted uppercase',
        align === 'right' && 'text-right',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  className,
}: {
  children?: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <td className={cn('border-b border-border px-5 py-3 align-middle', align === 'right' && 'text-right', className)}>
      {children}
    </td>
  );
}
