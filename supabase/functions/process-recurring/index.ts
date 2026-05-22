import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'

function addPeriod(dateStr: string, frequency: Frequency): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  switch (frequency) {
    case 'daily':     d.setUTCDate(d.getUTCDate() + 1);         break
    case 'weekly':    d.setUTCDate(d.getUTCDate() + 7);         break
    case 'biweekly':  d.setUTCDate(d.getUTCDate() + 14);        break
    case 'monthly':   d.setUTCMonth(d.getUTCMonth() + 1);       break
    case 'quarterly': d.setUTCMonth(d.getUTCMonth() + 3);       break
    case 'yearly':    d.setUTCFullYear(d.getUTCFullYear() + 1); break
  }
  return d.toISOString().split('T')[0]
}

Deno.serve(async (req) => {
  // Allow cron invocations (no auth header) and authenticated calls
  const authHeader = req.headers.get('Authorization')
  const isServiceRole = authHeader?.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '__none__')
  const isCron = req.headers.get('x-supabase-cron') === '1'

  if (!isCron && !isServiceRole) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const today = new Date().toISOString().split('T')[0]

  const { data: rules, error: rulesError } = await supabase
    .from('recurring_rules')
    .select('*')
    .eq('is_active', true)
    .eq('auto_create', true)
    .lte('next_date', today)

  if (rulesError) {
    return new Response(JSON.stringify({ error: rulesError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!rules || rules.length === 0) {
    return new Response(JSON.stringify({ generated: 0, processed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let generated = 0
  const MAX_ITERATIONS = 24

  for (const rule of rules) {
    if (rule.end_date && rule.next_date > rule.end_date) continue

    let nextDate: string = rule.next_date
    let iterations = 0

    while (nextDate <= today && iterations < MAX_ITERATIONS) {
      if (rule.end_date && nextDate > rule.end_date) break

      // Idempotency: skip if transaction already exists for this rule+date
      const { count } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('recurring_rule_id', rule.id)
        .eq('date', nextDate)

      if (!count || count === 0) {
        const { error: txError } = await supabase.from('transactions').insert({
          user_id: rule.user_id,
          account_id: rule.account_id,
          category_id: rule.category_id,
          type: rule.type,
          amount: rule.amount,
          description: rule.name,
          date: nextDate,
          status: 'completed',
          recurring_rule_id: rule.id,
        })

        if (!txError) generated++
      }

      nextDate = addPeriod(nextDate, rule.frequency as Frequency)
      iterations++
    }

    await supabase
      .from('recurring_rules')
      .update({ next_date: nextDate, last_generated_date: today })
      .eq('id', rule.id)
  }

  console.log(`[process-recurring] ${today}: processed ${rules.length} rules, generated ${generated} transactions`)

  return new Response(
    JSON.stringify({ generated, processed: rules.length, date: today }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
