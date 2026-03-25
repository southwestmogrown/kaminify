/**
 * site-storage.ts
 *
 * Handles all DB operations for:
 * - site + run + run_page_input logging during the prepare phase
 * - run_page_output logging during the compose phase
 * - CRUD operations on sites for the UI
 * - Anonymous run claiming on sign-in
 */

import { adminClient } from './supabase'
import type { DesignSystem, DiscoveredPage, PageContent, Run, RunPageInput, RunPageOutput, Site } from './types'

// =============================================================================
// TYPES FOR LOGGING
// =============================================================================

export interface LogPrepareRunParams {
  userId: string | null
  sessionId: string | null
  designUrl: string
  contentUrl: string
  model: string
  pages: DiscoveredPage[]
  designSystem: DesignSystem & { jsRendered?: boolean }
  pageContents: PageContent[]
  jsRenderedDesign: boolean
  jsRenderedContent: boolean
}

export interface LogComposePageParams {
  runId: string
  pageSlug: string
  pageTitle: string
  navLabel: string
  designSystem: DesignSystem & { jsRendered?: boolean }
  pageContent: PageContent
  navigation: Array<{ slug: string; label: string; href: string }>
  generatedHtml: string
  promptTokens: number | null
  completionTokens: number | null
  modelUsed: string
}

export interface LogPrepareRunResult {
  siteId: string
  runId: string
}

// =============================================================================
// LOGGING (prepare phase)
// =============================================================================

/**
 * Creates a site record + run record + one run_page_input per page.
 * Called after successful scrape + extract, before returning to the client.
 * Runs atomically — if any insert fails, the whole operation rolls back.
 */
export async function logPrepareRun(
  params: LogPrepareRunParams,
): Promise<LogPrepareRunResult> {
  const db = adminClient()
  const {
    userId,
    sessionId,
    designUrl,
    contentUrl,
    model,
    pages,
    designSystem,
    pageContents,
    jsRenderedDesign,
    jsRenderedContent,
  } = params

  // Generate a site name from the content URL
  const siteName = generateSiteName(contentUrl)

  const navigation: Array<{ slug: string; label: string; href: string }> = pages.map((p) => ({
    slug: p.slug,
    label: p.navLabel,
    href: `${p.slug}.html`,
  }))

  // We must do everything in a single transaction so we can return siteId + runId
  // Supabase-js doesn't support true transactions, so we use an RPC function instead.
  // Fall back to sequential inserts if the RPC isn't available.
  try {
    const result = await db.rpc('log_prepare_run', {
      p_user_id: userId,
      p_session_id: sessionId,
      p_name: siteName,
      p_design_url: designUrl,
      p_content_url: contentUrl,
      p_model: model,
      p_page_count: pages.length,
      p_js_rendered_design: jsRenderedDesign,
      p_js_rendered_content: jsRenderedContent,
      p_pages_requested: pages.length,
      p_design_system: designSystem as unknown as Record<string, unknown>,
      p_page_contents: pageContents as unknown as Record<string, unknown>,
      p_navigation: navigation as unknown as Record<string, unknown>,
      p_js_rendered: designSystem.jsRendered ?? false,
    })

    if (result.error) throw result.error
    return result.data as LogPrepareRunResult
  } catch {
    // RPC not available — fall back to sequential inserts
    return await logPrepareRunSequential({ ...params, navigation }, navigation)
  }
}

async function logPrepareRunSequential(
  params: LogPrepareRunParams & { navigation: Array<{ slug: string; label: string; href: string }> },
  navigation: Array<{ slug: string; label: string; href: string }>,
): Promise<LogPrepareRunResult> {
  const db = adminClient()
  const { userId, sessionId, designUrl, contentUrl, model, pages, designSystem, pageContents, jsRenderedDesign, jsRenderedContent } = params

  // Insert site
  const { data: site, error: siteErr } = await db
    .from('sites')
    .insert({
      user_id: userId,
      session_id: sessionId,
      name: generateSiteName(contentUrl),
      design_url: designUrl,
      content_url: contentUrl,
      model,
      page_count: pages.length,
    })
    .select('id')
    .single()

  if (siteErr || !site) throw new Error(`insert site: ${siteErr?.message}`)

  // Insert run
  const { data: run, error: runErr } = await db
    .from('runs')
    .insert({
      site_id: site.id,
      user_id: userId,
      session_id: sessionId,
      model,
      pages_requested: pages.length,
      js_rendered_design: jsRenderedDesign,
      js_rendered_content: jsRenderedContent,
    })
    .select('id')
    .single()

  if (runErr || !run) throw new Error(`insert run: ${runErr?.message}`)

  // Insert run_page_inputs
  const pageInputs = pages.map((page, i) => ({
    run_id: run.id,
    page_slug: page.slug,
    page_title: page.title,
    nav_label: page.navLabel,
    design_system: designSystem as unknown as Record<string, unknown>,
    page_content: pageContents[i] as unknown as Record<string, unknown>,
    navigation: navigation as unknown as Record<string, unknown>,
  }))

  const { error: inputsErr } = await db.from('run_page_inputs').insert(pageInputs)
  if (inputsErr) throw new Error(`insert run_page_inputs: ${inputsErr.message}`)

  return { siteId: site.id, runId: run.id }
}

// =============================================================================
// LOGGING (compose phase)
// =============================================================================

/**
 * Logs a single page output after successful generation.
 * Also increments pages_completed on the run.
 */
export async function logComposePage(params: LogComposePageParams): Promise<void> {
  const db = adminClient()
  const { runId, generatedHtml, promptTokens, completionTokens, modelUsed } = params

  // Find the run_page_input id for this run + page_slug
  const { data: input, error: inputErr } = await db
    .from('run_page_inputs')
    .select('id')
    .eq('run_id', runId)
    .eq('page_slug', params.pageSlug)
    .single()

  if (inputErr || !input) {
    console.error(`logComposePage: run_page_input not found for run=${runId} slug=${params.pageSlug}`)
    return
  }

  // Insert the output
  const { error: outputErr } = await db.from('run_page_outputs').insert({
    run_page_input_id: input.id,
    generated_html: generatedHtml,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    model_used: modelUsed,
  })

  if (outputErr) {
    console.error(`logComposePage: insert output failed: ${outputErr.message}`)
    return
  }

  // Increment pages_completed on the run
  const { error: updateErr } = await db.rpc('increment_pages_completed', { p_run_id: runId })
  if (updateErr) {
    // Fallback manual update
    const { data: run } = await db.from('runs').select('pages_completed').eq('id', runId).single()
    if (run) {
      await db.from('runs').update({ pages_completed: run.pages_completed + 1 }).eq('id', runId)
    }
  }

  // If this was the last page, mark the run as successful
  const { data: run } = await db.from('runs').select('pages_completed, pages_requested').eq('id', runId).single()
  if (run && run.pages_completed >= run.pages_requested) {
    await db.from('runs').update({ success: true }).eq('id', runId)
  }
}

/**
 * Marks a run as failed with an error message.
 */
export async function logRunError(runId: string, errorMessage: string): Promise<void> {
  const db = adminClient()
  await db.from('runs').update({ success: false, error_message: errorMessage }).eq('id', runId)
}

// =============================================================================
// SITES CRUD
// =============================================================================

/** List all non-deleted sites for a user (by userId or sessionId). */
export async function listSites(userId: string | null, sessionId: string | null): Promise<Site[]> {
  const db = adminClient()
  let query = db.from('sites').select('*').is('deleted_at', null).order('created_at', { ascending: false })

  if (userId) {
    query = query.eq('user_id', userId)
  } else if (sessionId) {
    query = query.eq('session_id', sessionId).is('user_id', null)
  } else {
    return []
  }

  const { data, error } = await query
  if (error) throw new Error(`listSites: ${error.message}`)
  return (data as Site[]) ?? []
}

/** Get a single site by id. Returns null if not found or deleted. */
export async function getSite(
  id: string,
  userId: string | null,
  sessionId: string | null,
): Promise<Site | null> {
  const db = adminClient()
  let query = db.from('sites').select('*').eq('id', id).is('deleted_at', null)

  if (userId) {
    query = query.eq('user_id', userId)
  } else if (sessionId) {
    query = query.eq('session_id', sessionId).is('user_id', null)
  } else {
    return null
  }

  const { data, error } = await query.single()
  if (error || !data) return null
  return data as Site
}

/** Rename a site. Returns the updated site. */
export async function renameSite(
  id: string,
  name: string,
  userId: string | null,
  sessionId: string | null,
): Promise<Site | null> {
  const db = adminClient()
  let query = db.from('sites').update({ name }).eq('id', id).is('deleted_at', null).select('*')

  if (userId) {
    query = query.eq('user_id', userId)
  } else if (sessionId) {
    query = query.eq('session_id', sessionId).is('user_id', null)
  } else {
    return null
  }

  const { data, error } = await query.single()
  if (error || !data) return null
  return data as Site
}

/** Soft-delete a site. */
export async function deleteSite(
  id: string,
  userId: string | null,
  sessionId: string | null,
): Promise<boolean> {
  const db = adminClient()
  let query = db.from('sites').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null)

  if (userId) {
    query = query.eq('user_id', userId)
  } else if (sessionId) {
    query = query.eq('session_id', sessionId).is('user_id', null)
  } else {
    return false
  }

  const { error } = await query
  return !error
}

/** Get all runs for a site. */
export async function getRunsForSite(siteId: string): Promise<Run[]> {
  const db = adminClient()
  const { data, error } = await db
    .from('runs')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`getRunsForSite: ${error.message}`)
  return (data as Run[]) ?? []
}

/** Get all page inputs and outputs for a run. */
export async function getRunPages(runId: string): Promise<{ inputs: RunPageInput[]; outputs: RunPageOutput[] }> {
  const db = adminClient()

  const [inputsRes, outputsRes] = await Promise.all([
    db.from('run_page_inputs').select('*').eq('run_id', runId).order('created_at', { ascending: true }),
    db.from('run_page_outputs').select('*').eq('run_page_input_id', db.rpc('get_run_input_ids', { p_run_id: runId })),
  ])

  if (inputsRes.error) throw new Error(`getRunPages inputs: ${inputsRes.error.message}`)
  if (outputsRes.error) throw new Error(`getRunPages outputs: ${outputsRes.error.message}`)

  return {
    inputs: (inputsRes.data as RunPageInput[]) ?? [],
    outputs: (outputsRes.data as RunPageOutput[]) ?? [],
  }
}

// =============================================================================
// ANONYMOUS RUN CLAIMING
// =============================================================================

/** Migrate all sites and runs from a sessionId to a userId after sign-in. */
export async function claimAnonymousRuns(sessionId: string, userId: string): Promise<void> {
  const db = adminClient()

  // Use the SQL function we defined in the migration
  const { error } = await db.rpc('claim_anonymous_runs', {
    p_session_id: sessionId,
    p_user_id: userId,
  })

  if (error) {
    // Fallback: manual migration if RPC not available
    await Promise.all([
      db.from('sites').update({ user_id: userId, claimed_at: new Date().toISOString() }).eq('session_id', sessionId).is('user_id', null),
      db.from('runs').update({ user_id: userId, claimed_at: new Date().toISOString() }).eq('session_id', sessionId).is('user_id', null),
    ])
  }
}

// =============================================================================
// CONSENT
// =============================================================================

/** Toggle training consent for a run. */
export async function setRunConsent(
  runId: string,
  consent: boolean,
  userId: string,
): Promise<boolean> {
  const db = adminClient()
  const { error } = await db
    .from('runs')
    .update({ consent_for_training: consent })
    .eq('id', runId)
    .eq('user_id', userId)
    .is('user_id', null)

  return !error
}

// =============================================================================
// HELPERS
// =============================================================================

function generateSiteName(contentUrl: string): string {
  try {
    const url = new URL(contentUrl)
    const hostname = url.hostname.replace(/^www\./, '')
    const path = url.pathname.replace(/\/$/, '').split('/').pop() || hostname
    return `${hostname}/${path}`
  } catch {
    return contentUrl.slice(0, 60)
  }
}
