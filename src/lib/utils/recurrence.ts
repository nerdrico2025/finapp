import type { RecurrenceFrequency } from '@/types'

// ─── Recurrence date math ───────────────────────────────────────────────────
//
// Shared by billAlerts.ts e google/calendar.ts para as frequências não-mensais
// de bill_alerts (mensal continua usando day_of_month, ver Prompt 3 do plano
// Alertas/Previsão). Mesma lógica que já existia em recurring.ts/previsao.ts
// para recurring_rules — reaproveitada aqui em vez de duplicada de novo.

export function addPeriod(dateStr: string, frequency: RecurrenceFrequency): string {
  const d = new Date(dateStr + 'T12:00:00')
  switch (frequency) {
    case 'daily':     d.setDate(d.getDate() + 1);         break
    case 'weekly':    d.setDate(d.getDate() + 7);         break
    case 'biweekly':  d.setDate(d.getDate() + 14);        break
    case 'monthly':   d.setMonth(d.getMonth() + 1);       break
    case 'quarterly': d.setMonth(d.getMonth() + 3);       break
    case 'yearly':    d.setFullYear(d.getFullYear() + 1); break
  }
  return d.toISOString().split('T')[0]
}

export function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

/**
 * Avança `anchorDate` por `frequency` até chegar na primeira ocorrência >= hoje
 * (ou >= `fromDate`, se informado). Usada para frequências != 'monthly', cuja
 * "próxima ocorrência" é âncorada em bill_alerts.next_date em vez de um
 * day_of_month fixo.
 */
export function nextOccurrenceFrom(
  anchorDate: string,
  frequency: RecurrenceFrequency,
  fromDate?: string,
): string {
  const today = fromDate ?? new Date().toISOString().split('T')[0]
  let candidate = anchorDate
  let safety = 0
  while (candidate < today && safety < 2000) {
    candidate = addPeriod(candidate, frequency)
    safety++
  }
  return candidate
}
