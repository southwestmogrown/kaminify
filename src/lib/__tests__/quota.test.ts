import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UserRecord } from '../types'

// --- Supabase mock -----------------------------------------------------------

type BuilderResult<T> = Promise<{ data: T | null; error: { message: string } | null }>

interface MockBuilder {
  upsert: (_data: unknown, _opts?: unknown) => Promise<{ error: null }>
  select: (_cols: string) => MockBuilder
  eq: (_col: string, _val: string) => MockBuilder
  single: () => BuilderResult<UserRecord>
  update: (_data: unknown) => MockBuilder
  rpc?: (_fn: string, _args: unknown) => Promise<{ error: { message: string } | null }>
}

function makeSupabaseMock(userRecord: UserRecord, rpcError: { message: string } | null = null) {
  const fetchSingle = vi.fn().mockResolvedValue({ data: userRecord, error: null })
  const updateSingle = vi.fn().mockResolvedValue({
    data: { ...userRecord, runs_this_month: 0, month_start: '2026-03-01' },
    error: null,
  })

  // Tracks which chain is in progress so .single() returns the right result
  let inUpdate = false

  const builder: MockBuilder = {
    upsert: vi.fn().mockResolvedValue({ error: null }),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(() => (inUpdate ? updateSingle() : fetchSingle())),
    update: vi.fn().mockImplementation(() => {
      inUpdate = true
      return builder
    }),
  }

  const rpc = vi.fn().mockResolvedValue({ error: rpcError })

  const db = {
    from: vi.fn().mockReturnValue(builder),
    rpc,
  }

  return { db, builder, fetchSingle, updateSingle, rpc }
}

vi.mock('../supabase', () => ({
  adminClient: vi.fn(),
}))

// Import after mock is registered
import { adminClient } from '../supabase'
import { getQuotaStatus, getOrCreateUser, incrementRun } from '../quota'

const mockedAdminClient = vi.mocked(adminClient)

// --- Helpers -----------------------------------------------------------------

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'uuid-1',
    clerk_user_id: 'user_abc',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: 'free',
    runs_this_month: 0,
    month_start: '2026-03-01',
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

// -----------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

// --- getQuotaStatus — free user ----------------------------------------------

describe('getQuotaStatus — free user', () => {
  it('returns tier: free, runsLimit: 3, canRun: true when runs_this_month = 0', async () => {
    const { db } = makeSupabaseMock(makeUser({ runs_this_month: 0 }))
    mockedAdminClient.mockReturnValue(db as unknown as ReturnType<typeof adminClient>)

    const status = await getQuotaStatus('user_abc')

    expect(status.tier).toBe('free')
    expect(status.runsLimit).toBe(3)
    expect(status.canRun).toBe(true)
  })

  it('returns canRun: true when runs_this_month = 2 (under limit)', async () => {
    const { db } = makeSupabaseMock(makeUser({ runs_this_month: 2 }))
    mockedAdminClient.mockReturnValue(db as unknown as ReturnType<typeof adminClient>)

    const status = await getQuotaStatus('user_abc')

    expect(status.canRun).toBe(true)
  })

  it('returns canRun: false when runs_this_month = 3 (at limit)', async () => {
    const { db } = makeSupabaseMock(makeUser({ runs_this_month: 3 }))
    mockedAdminClient.mockReturnValue(db as unknown as ReturnType<typeof adminClient>)

    const status = await getQuotaStatus('user_abc')

    expect(status.canRun).toBe(false)
  })
})

// --- getQuotaStatus — pro user -----------------------------------------------

describe('getQuotaStatus — pro user', () => {
  it('returns tier: pro, runsLimit: null, canRun: true regardless of run count', async () => {
    const { db } = makeSupabaseMock(makeUser({ subscription_status: 'pro', runs_this_month: 999 }))
    mockedAdminClient.mockReturnValue(db as unknown as ReturnType<typeof adminClient>)

    const status = await getQuotaStatus('user_abc')

    expect(status.tier).toBe('pro')
    expect(status.runsLimit).toBeNull()
    expect(status.canRun).toBe(true)
  })
})

// --- getOrCreateUser — month reset -------------------------------------------

describe('getOrCreateUser — month reset', () => {
  it('calls update to reset runs_this_month when month_start is a past month', async () => {
    const { db, builder } = makeSupabaseMock(makeUser({ month_start: '2026-02-01' }))
    mockedAdminClient.mockReturnValue(db as unknown as ReturnType<typeof adminClient>)

    await getOrCreateUser('user_abc')

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ runs_this_month: 0 }),
    )
  })
})

// --- incrementRun ------------------------------------------------------------

describe('incrementRun', () => {
  it('does not call fallback update when RPC succeeds', async () => {
    const { db, builder } = makeSupabaseMock(makeUser(), null)
    mockedAdminClient.mockReturnValue(db as unknown as ReturnType<typeof adminClient>)

    await incrementRun('user_abc')

    expect(builder.update).not.toHaveBeenCalled()
  })

  it('calls fallback update when RPC fails', async () => {
    const { db, builder } = makeSupabaseMock(makeUser(), { message: 'not found' })
    mockedAdminClient.mockReturnValue(db as unknown as ReturnType<typeof adminClient>)

    await incrementRun('user_abc')

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ runs_this_month: 1 }),
    )
  })
})
