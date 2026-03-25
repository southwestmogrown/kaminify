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

-- =============================================================================
-- RPC FUNCTIONS (called by site-storage.ts)
-- =============================================================================

-- log_prepare_run: atomic insert of site + run + all run_page_inputs. Returns {siteId, runId}.
CREATE OR REPLACE FUNCTION log_prepare_run(
  p_user_id          TEXT,
  p_session_id       TEXT,
  p_name             TEXT,
  p_design_url       TEXT,
  p_content_url      TEXT,
  p_model            TEXT,
  p_page_count       INTEGER,
  p_js_rendered_design  BOOLEAN,
  p_js_rendered_content BOOLEAN,
  p_pages_requested INTEGER,
  p_design_system    JSONB,
  p_page_contents    JSONB,
  p_navigation       JSONB,
  p_js_rendered      BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_site_id UUID;
  v_run_id   UUID;
BEGIN
  -- Insert site
  INSERT INTO sites (user_id, session_id, name, design_url, content_url, model, page_count)
  VALUES (p_user_id, p_session_id, p_name, p_design_url, p_content_url, p_model, p_page_count)
  RETURNING id INTO v_site_id;

  -- Insert run
  INSERT INTO runs (site_id, user_id, session_id, model, pages_requested, js_rendered_design, js_rendered_content)
  VALUES (v_site_id, p_user_id, p_session_id, p_model, p_pages_requested, p_js_rendered_design, p_js_rendered_content)
  RETURNING id INTO v_run_id;

  -- Insert run_page_inputs (one per page — page_contents and navigation are aligned arrays)
  INSERT INTO run_page_inputs (run_id, page_slug, page_title, nav_label, design_system, page_content, navigation)
  SELECT
    v_run_id,
    (nav_elem->>'slug')::TEXT,
    (nav_elem->>'title')::TEXT,
    (nav_elem->>'label')::TEXT,
    p_design_system,
    p_page_contents[(nav_idx - 1)],
    p_navigation
  FROM jsonb_array_elements(p_navigation) WITH ORDINALITY AS nav(nav_elem, nav_idx)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('siteId', v_site_id, 'runId', v_run_id);
END;
$$;

-- increment_pages_completed: atomic increment of pages_completed on a run.
CREATE OR REPLACE FUNCTION increment_pages_completed(p_run_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE runs
  SET pages_completed = pages_completed + 1
  WHERE id = p_run_id;
END;
$$;

-- get_run_input_ids: returns array of run_page_input UUIDs for a given run.
CREATE OR REPLACE FUNCTION get_run_input_ids(p_run_id UUID)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN ARRAY(
    SELECT id FROM run_page_inputs WHERE run_id = p_run_id ORDER BY created_at ASC
  );
END;
$$;
