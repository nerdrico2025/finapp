ALTER TABLE recurring_rules
ADD COLUMN IF NOT EXISTS bill_alert_id uuid REFERENCES bill_alerts(id) ON DELETE SET NULL;
