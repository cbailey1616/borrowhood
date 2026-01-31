import { Router } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { authenticate, requireVerified } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'borrowhood-uploads';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

// ============================================
// POST /api/uploads/presigned-url
// Generate a presigned URL for uploading to S3
// ============================================
router.post('/presigned-url', authenticate, requireVerified,
  body('contentType').isIn(ALLOWED_TYPES).withMessage('Invalid content type'),
  body('fileSize').isInt({ min: 1, max: MAX_FILE_SIZE }).withMessage(`File size must be under ${MAX_FILE_SIZE / 1024 / 1024}MB`),
  body('category').isIn(['listings', 'profiles', 'disputes']).withMessage('Invalid category'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { contentType, fileSize, category } = req.body;

    try {
      // Generate unique filename
      const extension = contentType.split('/')[1].replace('jpeg', 'jpg');
      const filename = `${uuidv4()}.${extension}`;
      const key = `${category}/${req.user.id}/${filename}`;

      // Create presigned URL for PUT operation
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: contentType,
        ContentLength: fileSize,
        // Add metadata for tracking
        Metadata: {
          'uploaded-by': req.user.id,
          'upload-date': new Date().toISOString(),
        },
      });

      const presignedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 300, // 5 minutes
      });

      // Return both the upload URL and the final public URL
      const publicUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;

      res.json({
        uploadUrl: presignedUrl,
        publicUrl,
        key,
        expiresIn: 300,
      });
    } catch (err) {
      console.error('Presigned URL generation error:', err);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  }
);

// ============================================
// POST /api/uploads/presigned-urls
// Generate multiple presigned URLs for batch upload
// ============================================
router.post('/presigned-urls', authenticate, requireVerified,
  body('files').isArray({ min: 1, max: 10 }).withMessage('Must provide 1-10 files'),
  body('files.*.contentType').isIn(ALLOWED_TYPES).withMessage('Invalid content type'),
  body('files.*.fileSize').isInt({ min: 1, max: MAX_FILE_SIZE }).withMessage(`File size must be under ${MAX_FILE_SIZE / 1024 / 1024}MB`),
  body('category').isIn(['listings', 'profiles', 'disputes']).withMessage('Invalid category'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { files, category } = req.body;

    try {
      const results = await Promise.all(
        files.map(async (file) => {
          const extension = file.contentType.split('/')[1].replace('jpeg', 'jpg');
          const filename = `${uuidv4()}.${extension}`;
          const key = `${category}/${req.user.id}/${filename}`;

          const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            ContentType: file.contentType,
            ContentLength: file.fileSize,
            Metadata: {
              'uploaded-by': req.user.id,
              'upload-date': new Date().toISOString(),
            },
          });

          const presignedUrl = await getSignedUrl(s3Client, command, {
            expiresIn: 300,
          });

          const publicUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;

          return {
            uploadUrl: presignedUrl,
            publicUrl,
            key,
          };
        })
      );

      res.json({
        urls: results,
        expiresIn: 300,
      });
    } catch (err) {
      console.error('Batch presigned URL generation error:', err);
      res.status(500).json({ error: 'Failed to generate upload URLs' });
    }
  }
);

export default router;
