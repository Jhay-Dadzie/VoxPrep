// Smoke test for question generation.
//   node verify-step2.mjs
// With a real OPENAI_API_KEY the last case returns 200 and prints the generated
// questions. Without one it returns 502, which still proves the error path.
// Safe to delete once there are real tests.
import request from 'supertest';
import app from './src/app.js';

const show = (name, res) =>
  console.log(`\n${name} -> ${res.status}\n${JSON.stringify(res.body, null, 2)}`);

show('GET /health', await request(app).get('/health'));

show(
  'POST unknown mode (expect 400)',
  await request(app).post('/api/interviews/questions').send({ mode: 'nope', source: 'hello' }),
);

show(
  'POST missing source (expect 400)',
  await request(app).post('/api/interviews/questions').send({ mode: 'job_interview' }),
);

show(
  'POST count out of range (expect 400)',
  await request(app)
    .post('/api/interviews/questions')
    .send({ mode: 'oral_exam', source: 'x'.repeat(200), count: 99 }),
);

show('GET /nope (expect 404)', await request(app).get('/nope'));

show(
  'POST valid body (200 with a real key, 502 without)',
  await request(app)
    .post('/api/interviews/questions')
    .send({ mode: 'viva_defense', source: 'A project about '.repeat(20), count: 3 }),
);
