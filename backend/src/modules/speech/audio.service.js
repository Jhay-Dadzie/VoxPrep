/**
 * Audio Service
 *
 * Handles:
 *  1. Audio file validation (format + size)
 *  2. Supabase Storage upload and signed-URL generation
 *  3. Audio file deletion
 *
 * Storage layout:
 *   Bucket: interview-audio
 *   Path:   {userId}/{sessionId-or-transcribe}/{questionId-or-audio}_{timestamp}_{shortUuid}{ext}
 *
 * Why separate from stt.service?
 *  - STT service owns Deepgram concerns only
 *  - Audio service owns file I/O concerns
 *  - Controller composes them as needed (upload → transcribe, or transcribe-only)
 */

import { randomUUID } from 'node:crypto';
import { getSupabaseAdminClient } from '../../config/supabase.js';
import { error as _error, info, warn } from '../../core/errors/logger.js';

// ─── Constants ────────────────────────────────────────────────────────────────

export const AUDIO_BUCKET = 'interview-audio';
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Allowed MIME types → file extension.
 * This is the single source of truth used by both the service and the
 * multer fileFilter in speech.routes.js.
 */
export const SUPPORTED_AUDIO_TYPES = Object.freeze({
  'audio/wav':    '.wav',
  'audio/wave':   '.wav',
  'audio/mp3':    '.mp3',
  'audio/mpeg':   '.mp3',
  'audio/webm':   '.webm',
  'audio/ogg':    '.ogg',
  'audio/mp4':    '.mp4',
  'audio/m4a':    '.m4a',
  'audio/x-m4a':  '.m4a',
  'audio/flac':   '.flac',
  'audio/aac':    '.aac',
  'audio/x-wav':  '.wav',
});

// ─── Service ──────────────────────────────────────────────────────────────────

class AudioService {
  /**
   * Validate an audio buffer and MIME type.
   * Throws a descriptive Error on failure; returns true on success.
   *
   * Called before every transcription so bad data never reaches Deepgram.
   *
   * @param {Buffer} buffer
   * @param {string} mimetype
   * @returns {true}
   */
  validateAudio(buffer, mimetype) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error('Audio file is empty');
    }

    if (buffer.length > MAX_AUDIO_BYTES) {
      const limitMB = MAX_AUDIO_BYTES / (1024 * 1024);
      const actualMB = (buffer.length / (1024 * 1024)).toFixed(1);
      throw new Error(
        `Audio file (${actualMB} MB) exceeds the ${limitMB} MB maximum`
      );
    }

    if (!SUPPORTED_AUDIO_TYPES[mimetype]) {
      throw new Error(
        `Unsupported audio type "${mimetype}". ` +
        `Supported formats: ${this.getSupportedFormats().join(', ')}`
      );
    }

    return true;
  }

  /**
   * Upload an audio buffer to Supabase Storage.
   * Returns the storage path and a fresh 1-hour signed URL.
   *
   * @param {Buffer} buffer
   * @param {string} mimetype
   * @param {string} userId
   * @param {{ sessionId?: string|null, questionId?: string|null, folder?: string }} [context]
   * @returns {Promise<{ path: string, url: string }>}
   */
  async uploadAudio(buffer, mimetype, userId, context = {}) {
    const supabase = getSupabaseAdminClient();
    const {
      sessionId = null,
      questionId = null,
      folder = 'transcribe',
    } = context ?? {};

    const ext = SUPPORTED_AUDIO_TYPES[mimetype] ?? '.audio';
    const filenamePrefix = questionId ?? 'audio';
    const storageFolder = sessionId ?? folder;
    const filename = `${filenamePrefix}_${Date.now()}_${randomUUID().slice(0, 8)}${ext}`;
    const storagePath = `${userId}/${storageFolder}/${filename}`;

    const { data, error } = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(storagePath, buffer, {
        contentType: mimetype,
        upsert: false,
      });

    if (error) {
      _error('Audio upload error:', error);
      throw new Error(`Failed to upload audio: ${error.message}`);
    }

    const url = await this.getSignedUrl(data.path);
    info(`Audio uploaded: ${data.path}`);

    return { path: data.path, url };
  }

  /**
   * Generate a signed URL for an existing audio file in storage.
   *
   * @param {string} storagePath  - Path returned by uploadAudio (data.path)
   * @param {number} [expiresIn=3600] - Seconds until URL expires (default 1 hour)
   * @returns {Promise<string>}
   */
  async getSignedUrl(storagePath, expiresIn = 3600) {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase.storage
      .from(AUDIO_BUCKET)
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      _error('getSignedUrl error:', error);
      throw new Error(`Failed to generate audio URL: ${error.message}`);
    }

    return data.signedUrl;
  }

  /**
   * Delete an audio file from storage (e.g., when a session is deleted).
   * Warns on failure rather than throwing — deletion is best-effort.
   *
   * @param {string} storagePath
   * @returns {Promise<boolean>}
   */
  async deleteAudio(storagePath) {
    const supabase = getSupabaseAdminClient();

    const { error } = await supabase.storage
      .from(AUDIO_BUCKET)
      .remove([storagePath]);

    if (error) {
      warn('deleteAudio error (non-fatal):', error);
      return false;
    }

    info(`Audio deleted: ${storagePath}`);
    return true;
  }

  /**
   * Returns the array of supported audio MIME types.
   * Used by GET /speech/formats and the multer fileFilter.
   *
   * @returns {string[]}
   */
  getSupportedFormats() {
    return Object.keys(SUPPORTED_AUDIO_TYPES);
  }
}

export default new AudioService();
