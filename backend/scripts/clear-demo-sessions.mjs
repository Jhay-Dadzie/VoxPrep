/**
 * Delete every practice session belonging to the demo user.
 *
 *   node scripts/clear-demo-sessions.mjs          # report only
 *   node scripts/clear-demo-sessions.mjs --yes    # actually delete
 *
 * Useful before a demo: testing leaves behind sessions whose scores are not
 * representative, and the dashboard opens on that average.
 *
 * Deleting a session cascades to its questions, responses, feedback and
 * statistics, so this is enough to reset the history. The demo user itself is
 * kept — recreating it would only change the id.
 *
 * Dry run by default. Deletion is irreversible.
 */
import 'dotenv/config';
import { getSupabaseAdmin, isSupabaseConfigured } from '../src/config/supabase.js';

const DEMO_EMAIL = 'demo@voxprep.app';
const confirmed = process.argv.includes('--yes');

if (!isSupabaseConfigured()) {
  console.error('Supabase is not configured. Nothing to do.');
  process.exit(1);
}

const db = getSupabaseAdmin();

const { data: user, error: userError } = await db
  .from('users')
  .select('id, email')
  .eq('email', DEMO_EMAIL)
  .maybeSingle();

if (userError) {
  console.error('Could not look up the demo user:', userError.message);
  process.exit(1);
}
if (!user) {
  console.log(`No user with email ${DEMO_EMAIL}. Nothing to clear.`);
  process.exit(0);
}

const { data: sessions, error: sessionError } = await db
  .from('interview_sessions')
  .select('id, session_title, practice_mode, status, overall_score, started_at')
  .eq('user_id', user.id);

if (sessionError) {
  console.error('Could not list sessions:', sessionError.message);
  process.exit(1);
}

if (sessions.length === 0) {
  console.log('No sessions to clear.');
  process.exit(0);
}

const byMode = sessions.reduce((acc, s) => {
  acc[s.practice_mode] = (acc[s.practice_mode] ?? 0) + 1;
  return acc;
}, {});

console.log(`Demo user ${user.email} has ${sessions.length} sessions:`);
for (const [mode, count] of Object.entries(byMode)) {
  console.log(`  ${mode.padEnd(15)} ${count}`);
}

if (!confirmed) {
  console.log('\nDry run. Re-run with --yes to delete them.');
  process.exit(0);
}

// Cascades to interview_questions, user_responses, feedback and
// session_statistics via ON DELETE CASCADE.
const { error: deleteError } = await db
  .from('interview_sessions')
  .delete()
  .eq('user_id', user.id);

if (deleteError) {
  console.error('Delete failed:', deleteError.message);
  process.exit(1);
}

// Source documents survive session deletion (ON DELETE SET NULL), so they are
// removed separately or they accumulate as orphans.
const { error: jdError } = await db.from('job_descriptions').delete().eq('user_id', user.id);
if (jdError) console.error('Could not remove source documents:', jdError.message);

const { count } = await db
  .from('interview_sessions')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', user.id);

console.log(`\nDeleted ${sessions.length} sessions. Remaining: ${count ?? 0}.`);
