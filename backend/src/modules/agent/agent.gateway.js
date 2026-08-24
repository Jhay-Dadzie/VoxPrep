import { WebSocketServer, WebSocket } from 'ws';
import { getSupabaseClient } from '../../config/supabase.js';
import { getCurrentTestUser, shouldUseTestAuth } from '../auth/auth.store.js';
import { info, warn, error as logError } from '../../core/errors/logger.js';
import { hasAgentCredentials } from '../../config/deepgram-agent.js';
import { MAX_SESSION_QUESTIONS, loadSessionContext } from '../interviews/interview.service.js';
import { resolvePanelSize } from '../interviews/modes.js';
import { resolvePanel } from '../interviews/panel.js';
import { AgentSession } from './agent.session.js';

/**
 * WebSocket entry point for a live voice interview.
 *
 * Mounted on the same HTTP server as the REST API, at
 * `/api/v1/interviews/agent`.
 *
 * ── Why authentication happens in a message, not a header ───────────────────
 *
 * The obvious approach is `?token=...` on the URL, and it is the wrong one:
 * query strings land in access logs, proxy logs and crash reports, and a
 * Supabase access token in a log file is a live credential. Headers would work
 * from React Native but not from a browser, which cannot set them on a
 * WebSocket.
 *
 * So the socket opens unauthenticated and stays mute until the first message
 * proves who is calling. A connection that does not do so promptly is dropped —
 * an open socket that has not identified itself is a resource anyone can spend.
 */

const AUTH_TIMEOUT_MS = 10_000;

/** Close codes. 4401/4403/4404 are application codes in the private range. */
const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_FORBIDDEN = 4403;
const CLOSE_NOT_FOUND = 4404;
const CLOSE_UNAVAILABLE = 4503;

const resolveUser = async (token) => {
  if (!token || typeof token !== 'string') return null;

  if (shouldUseTestAuth()) {
    try {
      const user = getCurrentTestUser(token);
      return { id: user.id, email: user.email };
    } catch {
      return null;
    }
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;

  return { id: data.user.id, email: data.user.email };
};

const reject = (socket, code, message) => {
  try {
    socket.send(JSON.stringify({ type: 'error', message }));
    socket.close(code, message);
  } catch {
    /* already gone */
  }
};

/**
 * Handle the opening handshake, then hand the socket to an AgentSession.
 *
 * @param {import('ws').WebSocket} socket
 */
const onConnection = (socket) => {
  let settled = false;

  const timeout = setTimeout(() => {
    if (!settled) reject(socket, CLOSE_UNAUTHORIZED, 'No credentials were sent.');
  }, AUTH_TIMEOUT_MS);

  socket.once('message', async (raw, isBinary) => {
    settled = true;
    clearTimeout(timeout);

    if (isBinary) {
      reject(socket, CLOSE_UNAUTHORIZED, 'Expected a start message before audio.');
      return;
    }

    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      reject(socket, CLOSE_UNAUTHORIZED, 'Malformed start message.');
      return;
    }

    if (msg.type !== 'start') {
      reject(socket, CLOSE_UNAUTHORIZED, 'Expected a start message.');
      return;
    }

    const user = await resolveUser(msg.token);
    if (!user) {
      reject(socket, CLOSE_UNAUTHORIZED, 'Your session has expired. Sign in again.');
      return;
    }

    if (!msg.session_id) {
      reject(socket, CLOSE_NOT_FOUND, 'No interview session was specified.');
      return;
    }

    let context;
    try {
      // Also the ownership check: this throws for a session belonging to
      // someone else, so there is no separate authorisation step to forget.
      context = await loadSessionContext(msg.session_id, user.id);
    } catch (err) {
      warn(`Voice interview rejected: ${err.message}`);
      reject(socket, CLOSE_NOT_FOUND, 'That interview could not be opened.');
      return;
    }

    if (context.session.status === 'completed') {
      reject(socket, CLOSE_FORBIDDEN, 'This interview has already been completed.');
      return;
    }

    // Written papers are answered by tapping, not by talking. Nothing in the app
    // opens this socket for one; a client that does is asking for a voice
    // session that has no questions to speak.
    if (context.session.session_kind === 'exam') {
      reject(socket, CLOSE_FORBIDDEN, 'This session is a written exam and has no voice interview.');
      return;
    }

    const jobData = context.session.job_descriptions;
    if (!jobData?.job_content) {
      reject(socket, CLOSE_FORBIDDEN, 'This session has no source material to interview from.');
      return;
    }

    const maxQuestions = Math.min(
      Number(msg.max_questions) || MAX_SESSION_QUESTIONS,
      MAX_SESSION_QUESTIONS
    );

    // Clamped against the mode: a visa interview is one officer at one window
    // whatever roster the client sends.
    const panelSize = resolvePanelSize(msg.mode, msg.panel_size ?? msg.panel?.length);
    const panel = resolvePanel(msg.panel, { size: panelSize, voice: msg.voice });

    info(
      `Voice interview opening for session ${msg.session_id} ` +
      `(max ${maxQuestions} questions, ${panel.length} on the panel)`
    );

    new AgentSession({
      client: socket,
      sessionId: msg.session_id,
      userId: user.id,
      jobData,
      options: {
        mode: msg.mode,
        voice: msg.voice,
        panel,
        maxQuestions,
        candidateName: msg.candidate_name,
      },
    }).start();
  });

  socket.on('error', (err) => logError('Voice interview socket error:', err));
};

/**
 * Attach the voice interview gateway to a running HTTP server.
 *
 * `noServer` with a manual upgrade check rather than `{ server, path }`: this
 * process may later serve other WebSocket paths, and a server-wide handler
 * would swallow their upgrades.
 */
export const attachAgentGateway = (server) => {
  if (!hasAgentCredentials()) {
    warn('DEEPGRAM_API_KEY is not set — live voice interviews are disabled.');
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  wss.on('connection', onConnection);

  server.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url, 'http://localhost');
    if (pathname !== '/api/v1/interviews/agent') return;

    if (!hasAgentCredentials()) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      if (ws.readyState === WebSocket.OPEN) wss.emit('connection', ws, request);
    });
  });

  info('Voice interview gateway listening on /api/v1/interviews/agent');
  return wss;
};

export default { attachAgentGateway, CLOSE_UNAUTHORIZED, CLOSE_FORBIDDEN, CLOSE_NOT_FOUND, CLOSE_UNAVAILABLE };
