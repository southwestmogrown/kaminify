-- Migration: 003_sites_and_training
-- Site storage + run logging for future LLM training data
-- Run: paste into Supabase SQL Editor, or apply via Supabase MCP

-- =============================================================================
-- TABLES
-- =============================================================================

-- User-persisted sites
CREATE TABLE IF NOT EXISTS sites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT,                            -- clerk_user_id (NULL for anonymous)
  session_id  TEXT,                            -- anonymous session ID for retroactive claim
  name        TEXT NOT NULL,
  design_url  TEXT NOT NULL,
  content_url TEXT NOT NULL,
  page_count  INTEGER NOT NULL DEFAULT 0,
  model       TEXT NOT NULL,                   -- 'haiku' | 'sonnet' | 'opus'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ                       -- soft delete
);

CREATE INDEX IF NOT EXISTS sites_user_id_idx ON sites (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS sites_session_id_idx ON sites (session_id) WHERE user_id IS NULL AND deleted_at IS NULL;

-- Each pipeline execution (one per "Clone" button press)
CREATE TABLE IF NOT EXISTS runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id               UUID REFERENCES sites(id) ON DELETE SET NULL,
  user_id               TEXT,                            -- NULL for anonymous
  session_id            TEXT,                            -- anonymous session ID
  model                 TEXT NOT NULL,                   -- 'haiku' | 'sonnet' | 'opus'
  pages_requested       INTEGER NOT NULL,
  pages_completed       INTEGER NOT NULL DEFAULT 0,
  js_rendered_design    BOOLEAN NOT NULL DEFAULT false,
  js_rendered_content   BOOLEAN NOT NULL DEFAULT false,
  success               BOOLEAN NOT NULL DEFAULT false,
  error_message         TEXT,
  duration_ms            INTEGER,
  consent_for_training  BOOLEAN NOT NULL DEFAULT false,
  claimed_at            TIMESTAMPTZ,                     -- when anon runs were claimed by a signed-in user
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runs_user_id_idx ON runs (user_id);
CREATE INDEX IF NOT EXISTS runs_session_id_idx ON runs (session_id) WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS runs_consent_idx ON runs (consent_for_training) WHERE consent_for_training = true;

-- Per-page inputs: what we sent to Claude (the prompt context)
CREATE TABLE IF NOT EXISTS run_page_inputs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  page_slug       TEXT NOT NULL,
  page_title      TEXT NOT NULL,
  nav_label       TEXT NOT NULL,

  -- Full DesignSystem snapshot (as JSON)
  design_system   JSONB NOT NULL,

  -- Full PageContent snapshot (as JSON)
  page_content    JSONB NOT NULL,

  -- Navigation entries
  navigation      JSONB NOT NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS run_page_inputs_run_id_idx ON run_page_inputs (run_id);

-- Per-page outputs: what Claude returned (the training pair completion)
CREATE TABLE IF NOT EXISTS run_page_outputs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_page_input_id   UUID NOT NULL REFERENCES run_page_inputs(id) ON DELETE CASCADE,

  prompt_tokens       INTEGER,
  completion_tokens   INTEGER,
  model_used          TEXT NOT NULL,

  generated_html      TEXT NOT NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS run_page_outputs_input_id_idx ON run_page_outputs (run_page_input_id);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;

-- sites: users see only their own sites (by user_id or session_id)
CREATE POLICY sites_own_select ON sites FOR SELECT USING (
  user_id = current_setting('auth.user_id')::text
  OR (user_id IS NULL AND session_id = current_setting('auth.session_id')::text)
);

CREATE POLICY sites_own_update ON sites FOR UPDATE USING (
  user_id = current_setting('auth.user_id')::text
  OR (user_id IS NULL AND session_id = current_setting('auth.session_id')::text)
);

CREATE POLICY sites_own_delete ON sites FOR DELETE USING (
  user_id = current_setting('auth.user_id')::text
  OR (user_id IS NULL AND session_id = current_setting('auth.session_id')::text)
);

-- runs: users see only their own runs (by user_id or session_id)
CREATE POLICY runs_own_select ON runs FOR SELECT USING (
  user_id = current_setting('auth.user_id')::text
  OR (user_id IS NULL AND session_id = current_setting('auth.session_id')::text)
);

CREATE POLICY runs_own_update ON runs FOR UPDATE USING (
  user_id = current_setting('auth.user_id')::text
);

-- run_page_inputs / run_page_outputs: cascade from runs (no separate policy needed)
-- Access is controlled via runs since they reference run_id

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- claim_anonymous_runs: migrate sites + runs from session_id to user_id after sign-in
CREATE OR REPLACE FUNCTION claim_anonymous_runs(p_session_id TEXT, p_user_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE sites
  SET user_id = p_user_id, claimed_at = now()
  WHERE session_id = p_session_id AND user_id IS NULL;

  UPDATE runs
  SET user_id = p_user_id, claimed_at = now()
  WHERE session_id = p_session_id AND user_id IS NULL;
END;
$$;

-- touch_updated_at: auto-update updated_at on sites
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sites_updated_at ON sites;
CREATE TRIGGER sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
