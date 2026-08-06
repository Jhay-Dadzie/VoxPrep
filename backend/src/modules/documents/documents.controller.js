import { extractText } from './documents.service.js';

export async function postExtract(req, res) {
  const { filename, mimeType, base64 } = req.body;

  const result = await extractText({ filename, mimeType, base64 });

  res.status(200).json({
    success: true,
    data: { filename, ...result },
  });
}
