-- 004_billing.sql
-- Add Stripe billing columns to the users table.
-- Uses IF NOT EXISTS so it's safe to run against a DB that already has these
-- columns (e.g. production where they were added manually).

ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status    TEXT NOT NULL DEFAULT 'free';

-- Index used by the webhook handler to look up users by Stripe customer ID
CREATE INDEX IF NOT EXISTS users_stripe_customer_id_idx
  ON users(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
