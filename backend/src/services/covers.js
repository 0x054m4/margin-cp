import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export function createCoverClient(options = {}) {
  // The browser supplies the bytes later. Do not sign the SDK's checksum of an
  // absent (empty) body; S3 still validates the signed length and HTTPS transport.
  return new S3Client({ ...options, requestChecksumCalculation: 'WHEN_REQUIRED' });
}

export function signCoverUpload(client, { bucket, key, contentType, size }) {
  return getSignedUrl(client, new PutObjectCommand({
    Bucket: bucket, Key: key, ContentType: contentType, ContentLength: size
  }), { expiresIn: 300, signableHeaders: new Set(['content-type', 'content-length']) });
}
