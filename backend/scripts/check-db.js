/**
 * Read-only database inspection. Makes no changes.
 *
 * Reports which of the tables defined in supabase_schema.sql already exist,
 * and checks the two things most likely to silently break Row Level Security.
 *
 *   node scripts/check-db.js
 */
import 'dotenv/config'
import pg from 'pg'

const EXPECTED_TABLES = [
  'users',
  'job_descriptions',
  'interview_sessions',
  'interview_questions',
  'user_responses',
  'feedback',
  'session_statistics',
  'reminders',
  'user_statistics',
  'audit_log',
]

if (!process.env.DATABASE_URL) {
  console.error('\n  DATABASE_URL is not set.')
  console.error('  Copy backend/.env.example to backend/.env and fill it in.\n')
  process.exit(1)
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const bullet = (ok, label) => `  ${ok ? '[x]' : '[ ]'} ${label}`

try {
  await client.connect()
  console.log('\n  Connected.\n')

  const { rows: present } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [EXPECTED_TABLES]
  )
  const found = new Set(present.map((r) => r.table_name))

  console.log('  Tables from supabase_schema.sql:')
  for (const t of EXPECTED_TABLES) console.log(bullet(found.has(t), t))

  if (found.size === 0) {
    console.log('\n  => Schema has NOT been applied. Nothing exists yet.\n')
    process.exit(0)
  }
  if (found.size < EXPECTED_TABLES.length) {
    console.log(`\n  => PARTIALLY applied (${found.size}/${EXPECTED_TABLES.length}).\n`)
  } else {
    console.log('\n  => Schema is fully applied.\n')
  }

  // The RLS policies compare auth.uid() to users.id. That only works if users.id
  // is the Supabase auth user id rather than an independently generated uuid.
  if (found.has('users')) {
    const { rows: fk } = await client.query(
      `SELECT ccu.table_schema AS ref_schema, ccu.table_name AS ref_table
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
       JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_name = 'users' AND kcu.column_name = 'id'`
    )
    const linked = fk.some((r) => r.ref_schema === 'auth' && r.ref_table === 'users')

    console.log('  Row Level Security wiring:')
    console.log(bullet(linked, 'public.users.id references auth.users(id)'))
    if (!linked) {
      console.log('      ^ without this, auth.uid() never matches and every')
      console.log('        RLS policy silently returns zero rows.')
    }

    const { rows: rls } = await client.query(
      `SELECT relname, relrowsecurity FROM pg_class
       WHERE relname = ANY($1) AND relnamespace = 'public'::regnamespace`,
      [EXPECTED_TABLES]
    )
    const rlsOn = rls.filter((r) => r.relrowsecurity).length
    console.log(`  ${rlsOn}/${rls.length} existing tables have RLS enabled.`)
  }

  console.log('')
} catch (err) {
  console.error(`\n  Connection failed: ${err.message}\n`)
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}
