// Writes one chunk of a resumable upload to disk. Shared by client uploads and admin uploads.
// Each chunk is checked against the SHA-256 the browser computed, and a bad or cut-off chunk is
// rolled back so the file on disk is always a clean prefix of the original.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CHUNK_SIZE } from './storage.js';

const busy = new Set(); // keys with a chunk in flight

/**
 * @param {import('express').Request} req   the PUT request; its body is the chunk
 * @param {object} o
 * @param {string} o.key        unique id for the upload (stops two chunks writing at once)
 * @param {string} o.filePath   the .part file being filled
 * @param {number} o.received   bytes already stored
 * @param {number} o.size       final file size
 * @returns {Promise<{status: number, body: object}>}
 */
export async function writeChunk(req, { key, filePath, received, size }) {
  const offset = Number(req.query.offset);
  const length = Number(req.get('content-length'));
  if (offset !== received) return { status: 409, body: { received } };
  if (!Number.isSafeInteger(length) || length <= 0 || length > CHUNK_SIZE || offset + length > size) {
    return { status: 400, body: { error: 'Bad chunk size.' } };
  }
  if (busy.has(key)) return { status: 409, body: { received } };
  busy.add(key);

  const expected = String(req.get('x-chunk-sha256') || '').toLowerCase();
  const hash = crypto.createHash('sha256');
  let written = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      written += chunk.length;
      if (written > length) return cb(new Error('Chunk larger than announced'));
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  const rollback = () => fsp.truncate(filePath, offset).catch(() => {});
  try {
    await pipeline(req, counter, fs.createWriteStream(filePath, { flags: 'r+', start: offset }));
    if (written !== length) {
      await rollback();
      return { status: 400, body: { error: 'The chunk arrived incomplete.', received: offset } };
    }
    if (expected && hash.digest('hex') !== expected) {
      await rollback();
      return { status: 422, body: { error: 'A piece of the file arrived damaged. Retrying.', received: offset } };
    }
    return { status: 200, body: { received: offset + written } };
  } catch (err) {
    await rollback();
    if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE' && err.code !== 'ECONNRESET') console.warn('upload chunk failed:', err.message);
    return { status: 400, body: { error: 'Upload interrupted.', received: offset } };
  } finally {
    busy.delete(key);
  }
}

/** True while a chunk for this upload is being written. */
export const isBusy = (key) => busy.has(key);

/** If a chunk was cut off mid-write, trust the disk: shrink back to the last complete chunk. */
export function reconcile(filePath, received) {
  if (!fs.existsSync(filePath)) return null;
  const onDisk = fs.statSync(filePath).size;
  if (onDisk === received) return received;
  const safe = Math.min(onDisk, received);
  fs.truncateSync(filePath, safe);
  return safe;
}
