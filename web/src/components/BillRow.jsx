import { useState } from 'react'
import { Users } from 'lucide-react'
import { api } from '../lib/api'
import { dueText, monthLabel, ron } from '../lib/format'
import { Button, StatusBadge, useToast } from './ui'
import ProviderLogo from '../modules/provider-map/ProviderLogo'

/** Plătește o factură și afișează confirmarea. */
export function usePayBill(onPaid) {
  const toast = useToast()
  const [payingId, setPayingId] = useState(null)

  async function pay(bill) {
    setPayingId(bill.id)
    try {
      const res = await api.payBill(bill.id)
      toast(`${bill.provider} plătită`)
      await onPaid?.(res)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setPayingId(null)
    }
  }

  return { pay, payingId }
}

export default function BillRow({ bill, onPay, paying, showPeriod = false }) {
  const urgent = bill.status === 'overdue' || (bill.status === 'unpaid' && bill.days_left <= 3)
  return (
    <div className="flex items-center gap-3 py-3">
      <ProviderLogo logo={bill.logo} cat={bill.category} className="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{bill.provider}</p>
          {bill.is_split && <Users className="h-3.5 w-3.5 shrink-0 text-brand-500" title="Împărțită" />}
        </div>
        <p className={`text-xs ${urgent ? 'font-medium text-red-600' : 'text-slate-500'}`}>
          {showPeriod && <span className="text-slate-500">{monthLabel(bill.period, { month: 'long', year: 'numeric' })} · </span>}
          {dueText(bill)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="text-right">
          <p className="font-semibold tabular-nums">{ron(bill.amount)}</p>
          <div className="hidden sm:block">
            <StatusBadge status={bill.status} />
          </div>
        </div>
        {onPay && bill.status !== 'paid' && (
          <Button onClick={() => onPay(bill)} loading={paying}>
            Plătește
          </Button>
        )}
      </div>
    </div>
  )
}
