import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/format'

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

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

function buildRRule(endDate?: string | null): string {
  if (!endDate) return 'RRULE:FREQ=MONTHLY'
  return `RRULE:FREQ=MONTHLY;UNTIL=${endDate.replace(/-/g, '')}`
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
  dayOfMonth: number
  daysBefore: number
  endDate?: string | null
  existingReminderEventId?: string | null
  existingDueEventId?: string | null
}): Promise<{ reminderEventId: string | null; dueEventId: string | null }> {
  const accessToken = await getValidAccessToken(params.userId)
  if (!accessToken) return { reminderEventId: null, dueEventId: null }

  const reminderDay = params.dayOfMonth - params.daysBefore
  const reminderDate = getNextDateForDay(reminderDay)
  const dueDate = getNextDateForDay(params.dayOfMonth)
  const rrule = buildRRule(params.endDate)
  const amountStr = params.amount ? ` — ${formatCurrency(params.amount)}` : ''

  const [reminderEventId, dueEventId] = await Promise.all([
    upsertSingleEvent(
      accessToken,
      `🔔 Lembrete: ${params.name}`,
      `Conta vence dia ${params.dayOfMonth}. Alerta via FinApp.`,
      reminderDate,
      rrule,
      params.existingReminderEventId,
    ),
    upsertSingleEvent(
      accessToken,
      `📅 Vence hoje: ${params.name}${amountStr}`,
      `Conta vence dia ${params.dayOfMonth}. Alerta via FinApp.`,
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
