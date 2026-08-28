import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { subtractDays, nextOccurrenceFrom } from '@/lib/utils/recurrence'
import type { RecurrenceFrequency } from '@/types'

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

// RRULE FREQ por frequência de bill_alerts — 'biweekly' e 'quarterly' não têm
// FREQ próprio no iCal, então usam INTERVAL sobre WEEKLY/MONTHLY.
const RRULE_FREQ: Record<RecurrenceFrequency, string> = {
  daily: 'FREQ=DAILY',
  weekly: 'FREQ=WEEKLY',
  biweekly: 'FREQ=WEEKLY;INTERVAL=2',
  monthly: 'FREQ=MONTHLY',
  quarterly: 'FREQ=MONTHLY;INTERVAL=3',
  yearly: 'FREQ=YEARLY',
}

async function getValidAccessToken(userId: string): Promise<string | null> {
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('google_access_token, google_refresh_token, google_token_expiry')
    .eq('id', userId)
    .single()

  if (!profile?.google_refresh_token) return null

  const expiryMs = profile.google_token_expiry
    ? new Date(profile.google_token_expiry).getTime()
    : 0
  const needsRefresh = expiryMs < Date.now() + 60_000

  if (!needsRefresh) return profile.google_access_token

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: profile.google_refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) return null

  const tokens = await res.json()

  await supabase
    .from('profiles')
    .update({
      google_access_token: tokens.access_token,
      google_token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    })
    .eq('id', userId)

  return tokens.access_token
}

function getNextDateForDay(day: number): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let candidate = new Date(today.getFullYear(), today.getMonth(), day)
  if (candidate < today) {
    candidate = new Date(today.getFullYear(), today.getMonth() + 1, day)
  }
  return candidate.toISOString().split('T')[0]
}

function buildRRule(frequency: RecurrenceFrequency, endDate?: string | null): string {
  const freq = RRULE_FREQ[frequency]
  if (!endDate) return `RRULE:${freq}`
  // UNTIL precisa do mesmo formato DATE-TIME do DTSTART (nossos eventos têm
  // hora, não são all-day) — daí o T235959Z, senão o Google ignora o limite.
  return `RRULE:${freq};UNTIL=${endDate.replace(/-/g, '')}T235959Z`
}

async function upsertSingleEvent(
  accessToken: string,
  summary: string,
  description: string,
  date: string,
  rrule: string,
  existingEventId?: string | null,
): Promise<string | null> {
  const event = {
    summary,
    description,
    start: { dateTime: `${date}T09:00:00`, timeZone: 'America/Sao_Paulo' },
    end: { dateTime: `${date}T09:30:00`, timeZone: 'America/Sao_Paulo' },
    recurrence: [rrule],
    // method: 'popup' é o que o app do Google Calendar transforma em
    // notificação push no celular (diferente de 'email', que só manda
    // e-mail) — useDefault: false porque senão o Google aplica os lembretes
    // padrão da agenda do usuário por cima, o que ele não escolheu aqui.
    // minutes: 0 = a notificação dispara no horário do próprio evento
    // (09:00). Cada alerta já vira DOIS eventos (ver upsertCalendarEvents):
    // um no dia "N dias antes" e outro no dia do vencimento — é essa
    // distância entre os dois eventos que dá a antecedência, não o lembrete
    // em si, então não precisa de minutos extras aqui.
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 0 }],
    },
  }

  const url = existingEventId
    ? `${CALENDAR_API}/calendars/primary/events/${existingEventId}`
    : `${CALENDAR_API}/calendars/primary/events`

  const res = await fetch(url, {
    method: existingEventId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })

  if (!res.ok) return null
  const data = await res.json()
  return data.id ?? null
}

export async function upsertCalendarEvents(params: {
  userId: string
  name: string
  amount?: number | null
  frequency: RecurrenceFrequency
  /** Usado quando frequency === 'monthly' — mesmo comportamento de sempre. */
  dayOfMonth?: number | null
  /** Âncora usada para as demais frequências (bill_alerts.next_date). */
  nextDate?: string | null
  daysBefore: number
  endDate?: string | null
  existingReminderEventId?: string | null
  existingDueEventId?: string | null
}): Promise<{ reminderEventId: string | null; dueEventId: string | null }> {
  const accessToken = await getValidAccessToken(params.userId)
  if (!accessToken) return { reminderEventId: null, dueEventId: null }

  // Mensal continua ancorado em day_of_month (comportamento pré-existente,
  // intocado); as demais frequências ancoram em next_date e avançam pela
  // mesma lógica de recorrência usada no resto do app.
  const isMonthlyByDay = params.frequency === 'monthly' && params.dayOfMonth != null

  const dueDate = isMonthlyByDay
    ? getNextDateForDay(params.dayOfMonth as number)
    : params.nextDate
      ? nextOccurrenceFrom(params.nextDate, params.frequency)
      : null

  if (!dueDate) return { reminderEventId: null, dueEventId: null }

  const reminderDate = isMonthlyByDay
    ? getNextDateForDay((params.dayOfMonth as number) - params.daysBefore)
    : subtractDays(dueDate, params.daysBefore)

  const rrule = buildRRule(params.frequency, params.endDate)
  const amountStr = params.amount ? ` — ${formatCurrency(params.amount)}` : ''
  const dueLabel = isMonthlyByDay
    ? `Conta vence dia ${params.dayOfMonth}. Alerta via FinApp.`
    : `Vence em ${formatDate(dueDate)}. Alerta via FinApp.`

  const [reminderEventId, dueEventId] = await Promise.all([
    upsertSingleEvent(
      accessToken,
      `🔔 Lembrete: ${params.name}`,
      dueLabel,
      reminderDate,
      rrule,
      params.existingReminderEventId,
    ),
    upsertSingleEvent(
      accessToken,
      `📅 Vence hoje: ${params.name}${amountStr}`,
      dueLabel,
      dueDate,
      rrule,
      params.existingDueEventId,
    ),
  ])

  return { reminderEventId, dueEventId }
}

export async function deleteCalendarEvent(
  userId: string,
  eventId: string,
): Promise<void> {
  const accessToken = await getValidAccessToken(userId)
  if (!accessToken) return

  try {
    await fetch(`${CALENDAR_API}/calendars/primary/events/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch {
    // ignore silently
  }
}
