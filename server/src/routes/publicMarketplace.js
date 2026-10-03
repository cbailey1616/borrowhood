import { Router } from 'express';
import { query } from '../utils/db.js';
import { ENABLE_PAYMENTS } from '../utils/constants.js';
import { servePublicPreviewPhoto } from '../services/privatePhotos.js';

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const visible = `l.status='active' AND l.is_available=true AND l.privacy_version=1
  AND l.public_preview_enabled=true AND 'town'=ANY(string_to_array(l.visibility::text, ','))
  AND u.status!='suspended' AND l.moderation_removed_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM borrow_transactions t WHERE t.listing_id=l.id
    AND t.status IN ('approved','paid','picked_up','return_pending','closed_unreturned'))
  ${ENABLE_PAYMENTS ? '' : "AND l.is_free=true AND COALESCE(l.price_per_day,0)=0 AND COALESCE(l.deposit_amount,0)=0"}`;

const view = row => ({
  id: row.id, title: row.title, description: row.description, condition: row.condition,
  listingType: row.listing_type || 'lend', category: row.category_name || null,
  isFree: row.is_free, directFee: row.direct_fee || null,
  photoUrl: row.has_photo ? `/api/public/listings/${row.id}/photo` : null,
  ownerMasked: true, previewOnly: true,
});

router.get('/listings', async (req, res) => {
  const page = Number(req.query.page || 1);
  const search = req.query.search || '';
  const type = req.query.type || 'all';
  if (!Number.isInteger(page) || page < 1 || page > 1000 || typeof search !== 'string' || search.length > 80 ||
    !['all','lend','giveaway','sell'].includes(type)) return res.status(400).json({ error: 'Invalid browse filter' });
  try {
    const { rows } = await query(`SELECT l.id,l.title,l.description,l.condition,l.listing_type,l.is_free,l.direct_fee,
      cat.name AS category_name, EXISTS(SELECT 1 FROM listing_photos p WHERE p.listing_id=l.id) AS has_photo
      FROM listings l JOIN users u ON u.id=l.owner_id LEFT JOIN categories cat ON cat.id=l.category_id
      WHERE ${visible} AND ($1::text='' OR l.title ILIKE '%'||$1||'%' OR l.description ILIKE '%'||$1||'%')
        AND ($2::text='all' OR l.listing_type=$2)
      ORDER BY l.created_at DESC,l.id DESC LIMIT 21 OFFSET $3`, [search, type, (page-1)*20]);
    res.set('Cache-Control','no-store').json({ items: rows.slice(0,20).map(view), hasMore: rows.length>20 });
  } catch (error) { res.status(500).json({ error: 'Could not browse items' }); }
});

router.get('/listings/:id', async (req,res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Item not found' });
  try {
    const { rows: [row] } = await query(`SELECT l.id,l.title,l.description,l.condition,l.listing_type,l.is_free,l.direct_fee,
      cat.name AS category_name, EXISTS(SELECT 1 FROM listing_photos p WHERE p.listing_id=l.id) AS has_photo
      FROM listings l JOIN users u ON u.id=l.owner_id LEFT JOIN categories cat ON cat.id=l.category_id
      WHERE l.id=$1 AND ${visible}`, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Item not found' });
    res.set('Cache-Control','no-store').json(view(row));
  } catch (error) { res.status(500).json({ error: 'Could not load item' }); }
});

router.get('/listings/:id/photo', async (req,res) => {
  if (!UUID.test(req.params.id)) return res.sendStatus(404);
  return servePublicPreviewPhoto(req,res,visible);
});

export default router;
