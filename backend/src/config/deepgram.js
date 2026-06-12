import { DeepgramClient } from '@deepgram/sdk';

let _client = null;

export function getDeepgramClient() {
  if (_client) return _client;

  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    throw new Error(
      'DEEPGRAM_API_KEY environment variable is required. ' +
      'Get your key at https://console.deepgram.com'
    );
  }

  _client = new DeepgramClient({ apiKey });
  return _client;
}

/**
 * Reset the singleton — test utility only.
 * Allows tests to inject a mock before importing services.
 *
 * @internal
 */
export function _resetDeepgramClient() {
  _client = null;
}

export default { getDeepgramClient };