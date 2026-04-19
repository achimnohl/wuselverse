import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * AES-256-GCM encryption service.
 * Requires PLATFORM_ENCRYPTION_KEY env var: 64 hex chars (32 bytes).
 *
 * Ciphertext format (base64-encoded): <12-byte IV> | <ciphertext> | <16-byte auth tag>
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer;

  constructor() {
    const raw = process.env.PLATFORM_ENCRYPTION_KEY;
    if (!raw || raw.length !== 64) {
      this.logger.warn(
        'PLATFORM_ENCRYPTION_KEY is missing or not 64 hex chars — per-agent credential encryption will fail at runtime',
      );
      // Defer hard failure to encrypt/decrypt time so startup still succeeds for non-CMA deployments
      this.key = Buffer.alloc(32);
    } else {
      this.key = Buffer.from(raw, 'hex');
    }
  }

  encrypt(plaintext: string): string {
    if (!process.env.PLATFORM_ENCRYPTION_KEY) {
      throw new Error('PLATFORM_ENCRYPTION_KEY is not configured — cannot encrypt agent credentials');
    }
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, encrypted, tag]).toString('base64');
  }

  decrypt(ciphertext: string): string {
    if (!process.env.PLATFORM_ENCRYPTION_KEY) {
      throw new Error('PLATFORM_ENCRYPTION_KEY is not configured — cannot decrypt agent credentials');
    }
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = buf.subarray(0, IV_BYTES);
    const tag = buf.subarray(buf.length - TAG_BYTES);
    const encrypted = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
