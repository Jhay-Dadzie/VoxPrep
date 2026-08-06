// Proves the database is reachable, the schema is applied, and a full session
// round trip works. Creates rows, reads them back, then cleans up after itself.
//
//   node verify-supabase.mjs
//
// Safe to delete once there are real tests.
import 'dotenv/config';
import { getSupabaseAdmin, isSupabaseConfigured } from './src/config/supabase.js';

const ok = (m) => console.log(`  OK    ${m}`);
const bad = (m) => console.log(`  FAIL  ${m}`);

if (!isSupabaseConfigured()) {
  console.log('\nSUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not both set in .env.');
  console.log('Fill them in, then run this again.\n');
  process.exit(1);
}

const db = getSupabaseAdmin();
let sessionId = null;
let failed = false;

console.log('\n1. Connection and schema');

// Every table the session pipeline touches. A missing one means the SQL was
// never run, which is the most common setup mistake.
const TABLES = [
  'users',
  'job_descriptions',
  'interview_sessions',
  'interview_questions',
  'user_responses',
  'feedback',
];

for (const table of TABLES) {
  const { error } = await db.from(table).select('id').limit(1);
  if (error) {
    bad(`${table} — ${error.message}`);
    failed = true;
  } else {
    ok(`${table}`);
  }
}

if (failed) {
  console.log('\nSchema looks incomplete. Run backend/supabase_schema.sql in the');
  console.log('Supabase SQL editor, then run this again.\n');
  process.exit(1);
}

console.log('\n2. Write round trip');

try {
  const { ensureDemoUser, createJobDescription, createSession, insertQuestions } = await import(
    './src/modules/interviews/interviews.repository.js'
  );

  const userId = await ensureDemoUser();
  ok(`demo user (${userId.slice(0, 8)}…)`);

  const jobDescriptionId = await createJobDescription({
    userId,
    title: 'Connection test',
    content: 'Temporary row written by verify-supabase.mjs. Safe to delete.',
  });
  ok('job_descriptions insert');

  sessionId = await createSession({
    userId,
    jobDescriptionId,
    title: 'Connection test',
    totalQuestions: 2,
  });
  ok(`interview_sessions insert (${sessionId.slice(0, 8)}…)`);

  const saved = await insertQuestions({
    sessionId,
    questions: [
      {
        question_number: 1,
        question_text: 'Does the database accept writes?',
        question_type: 'general',
        difficulty_level: 'easy',
        ideal_answer_guidelines: null,
        ai_model_used: 'verification',
      },
      {
        question_number: 2,
        question_text: 'Do the CHECK constraints accept these enum values?',
        question_type: 'behavioral',
        difficulty_level: 'medium',
        ideal_answer_guidelines: null,
        ai_model_used: 'verification',
      },
    ],
  });
  ok(`interview_questions insert (${saved.length} rows)`);

  console.log('\n3. Read back');

  const { data, error } = await db
    .from('interview_sessions')
    .select('id, status, total_questions, interview_questions(question_number, question_text)')
    .eq('id', sessionId)
    .single();

  if (error) throw error;

  ok(`session status "${data.status}" with ${data.interview_questions.length} questions joined`);
} catch (err) {
  bad(err.message ?? String(err));
  failed = true;
} finally {
  if (sessionId) {
    // ON DELETE CASCADE removes the questions with it.
    const { error } = await db.from('interview_sessions').delete().eq('id', sessionId);
    console.log(error ? `\n  (cleanup failed: ${error.message})` : '\n  cleaned up test rows');
  }
}

console.log(
  failed
    ? '\nSomething failed above.\n'
    : '\nAll good — persistence is working. Sessions will now save.\n',
);
process.exit(failed ? 1 : 0);
