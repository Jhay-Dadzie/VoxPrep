import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { errorHandler, notFoundHandler } from './core/middleware/index.js';
import interviewRoutes from './modules/interviews/interviews.routes.js';
import documentRoutes from './modules/documents/documents.routes.js';
import responseRoutes from './modules/responses/responses.routes.js';
import sessionRoutes from './modules/sessions/sessions.routes.js';


const app = express();

// Middleware
app.use(helmet());
app.use(cors());
// Uploads arrive base64 in JSON, which inflates them by about a third. The
// default 100kb limit would reject any real PDF before it reached the parser.
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));


// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/api/interviews', interviewRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/responses', responseRoutes);
app.use('/api/sessions', sessionRoutes);

// 404, then the terminal error handler — both must stay last, in this order.
app.use(notFoundHandler);
app.use(errorHandler);


export default app;
