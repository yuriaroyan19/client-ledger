import { Amount, Stat } from '@/components/ui/primitives';
import type { Schemas } from '@/lib/api/client';

/** Opening → +earnings → −expenses → closing. The same component for client and overview reports. */
export function TotalsGrid({ totals, isAllTime }: { totals: Schemas['ReportTotals']; isAllTime: boolean }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Opening balance" hint={isAllTime ? 'Start of records' : 'Before the selected range'}>
        <Amount value={totals.openingBalance} />
      </Stat>
      <Stat label="Earnings" hint={`${totals.movementCount} movement${totals.movementCount === 1 ? '' : 's'} in range`}>
        <Amount value={totals.totalEarnings} className="text-positive" />
      </Stat>
      <Stat
        label="Expenses"
        hint={
          <>
            Net <Amount value={totals.net} signed className="text-xs" />
          </>
        }
      >
        <Amount value={totals.totalExpenses} className="text-negative" />
      </Stat>
      <Stat label="Closing balance" hint={isAllTime ? 'Current balance' : 'At the end of the range'}>
        <Amount value={totals.closingBalance} />
      </Stat>
    </dl>
  );
}
