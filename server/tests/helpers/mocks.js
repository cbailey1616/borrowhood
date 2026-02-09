/**
 * Test Mocks — mock external services that should not make real API calls in tests.
 * - S3: mock presigned URL generation
 * - Image Analysis (Claude AI): return deterministic results
 *
 * Expo Push: no mock needed — the notifications service checks for push_token before
 * sending, and test users have no push_token set, so no real push calls happen.
 * DB notifications still get created for assertion.
 */

import { vi } from 'vitest';

/**
 * Mock the image analysis service (Claude AI).
 * Returns deterministic results so listing creation tests can proceed.
 */
export function mockImageAnalysis() {
  vi.mock('../../src/services/imageAnalysis.js', () => ({
    analyzeItemImage: vi.fn().mockResolvedValue({
      title: 'Power Drill',
      description: 'A cordless power drill in good condition',
      condition: 'good',
      category: 'Tools',
      suggestedPrice: 8.00,
    }),
  }));
}

/**
 * Mock S3 client for upload tests.
 */
export function mockS3() {
  vi.mock('@aws-sdk/client-s3', () => ({
    S3Client: vi.fn().mockImplementation(() => ({
      send: vi.fn().mockResolvedValue({}),
    })),
    PutObjectCommand: vi.fn(),
    GetObjectCommand: vi.fn(),
    DeleteObjectCommand: vi.fn(),
  }));

  vi.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: vi.fn().mockResolvedValue('https://test-bucket.s3.amazonaws.com/test-upload.jpg'),
  }));
}
