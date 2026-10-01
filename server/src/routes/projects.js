import { Router } from 'express';
import { query, withTransaction } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import { listingAccessSql } from '../utils/sharingPolicy.js';
import { PROJECTS, matchesProjectItem, seasonalProjects } from '../data/projects.js';
import { reconcileProjectExchanges } from '../services/projects.js';
const router = Router();
router.use(authenticate);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const wrap = handler => async (req,res,next) => { try { await handler(req,res); } catch(error) { if(error.status) res.status(error.status).json({error:error.message}); else next(error); } };
const candidates = async (userId, terms) => {
  // Discovery scope excludes shares, blocked users, own inventory, paid/transfer and reserved items.
  const { rows } = await query(`SELECT l.id,l.title,
    (SELECT url FROM listing_photos WHERE listing_id=l.id ORDER BY sort_order LIMIT 1) AS "photoUrl"
    FROM listings l WHERE l.status='active' AND l.is_available=true AND l.owner_id != $1
    AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.user_id=$1 AND b.blocked_id=l.owner_id) OR (b.blocked_id=$1 AND b.user_id=l.owner_id))
    AND COALESCE(l.listing_type,'lend')='lend' AND l.is_free=true
    AND COALESCE(l.price_per_day,0)=0 AND COALESCE(l.deposit_amount,0)=0
    AND ${listingAccessSql('l','$1',{discovery:true})}
    AND NOT EXISTS (SELECT 1 FROM borrow_transactions t WHERE t.listing_id=l.id AND t.status IN ('approved','paid','picked_up','return_pending'))
    AND l.title ILIKE ANY($2::text[]) ORDER BY l.created_at DESC LIMIT 300`, [userId,terms.map(term=>`%${term.replace(/[%_\\]/g,'')}%`)]);
  return rows;
};
const nearbyMatches = (item, inventory) => {
  const matching = inventory.filter(listing => matchesProjectItem(listing.title, item.terms));
  return { ...item, matches: matching.slice(0, 12), nearbyCount: matching.length, nearbyHasMore: inventory.length === 300 };
};
router.get('/ideas', wrap(async (req,res) => {
  const {rows:[location]} = await query('SELECT city,state FROM users WHERE id=$1',[req.user.id]);
  const templates = seasonalProjects(new Date(), location || {});
  const inventory = await candidates(req.user.id, [...new Set(templates.flatMap(p=>p.items.flatMap(i=>i.terms)))]);
  const ideas = templates.map(project => ({...project, items:project.items.map(item=>nearbyMatches(item, inventory))}));
  res.json(ideas.sort((a,b)=>b.seasonPriority-a.seasonPriority || b.items.filter(i=>i.matches.length).length/b.items.length-a.items.filter(i=>i.matches.length).length/a.items.length));
}));
router.get('/', wrap(async(req,res)=> {
  const {rows}=await query(`SELECT p.id,p.name,p.template_id AS "templateId",p.target_date::text AS "targetDate"
    FROM borrow_projects p WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 50`,[req.user.id]);
  res.json(rows);
}));
router.post('/', wrap(async(req,res)=> {
  const template=PROJECTS.find(p=>p.id===req.body.templateId);
  const custom=req.body.templateId===undefined||req.body.templateId==='custom';
  const name=template?.name||(typeof req.body.name==='string'?req.body.name.trim():'');
  if(!template&&!custom) return res.status(400).json({error:'Choose a project idea'});
  if(!name||name.length>80)return res.status(400).json({error:'Give your plan a name between 1 and 80 characters.'});
  const choices=template?.items||PROJECTS.flatMap(p=>p.items);
  let items=template?.items||[];
  if(req.body.items!==undefined) {
    if(!Array.isArray(req.body.items)||req.body.items.length>20) return res.status(400).json({error:'A plan can have up to 20 items.'});
    if(req.body.items.some(i=>!i||typeof i.label!=='string'||!i.label.trim()||i.label.trim().length>60||typeof i.owned!=='boolean')||new Set(req.body.items.map(i=>i.label.trim().toLowerCase())).size!==req.body.items.length) return res.status(400).json({error:'Use distinct item names between 1 and 60 characters.'});
    items=req.body.items.map(i=>{const known=choices.find(t=>t.label.toLowerCase()===i.label.trim().toLowerCase());return {...known,label:i.label.trim(),owned:i.owned,icon:known?.icon||'basket',terms:known?.terms||[i.label.trim().toLowerCase()]};});
  }
  const id=await withTransaction(async client=> {
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
    const templateId=template?.id||'custom';
    const {rows:[existing]}=await client.query("SELECT id FROM borrow_projects WHERE user_id=$1 AND template_id=$2 AND ($2!='custom' OR LOWER(name)=LOWER($3)) ORDER BY created_at DESC LIMIT 1",[req.user.id,templateId,name]);
    if(existing)return existing.id;
    const {rows:[count]}=await client.query('SELECT count(*)::integer AS count FROM borrow_projects WHERE user_id=$1',[req.user.id]);
    if(count.count>=50) throw Object.assign(new Error('Remove an old project before starting another.'),{status:409});
    const {rows:[project]}=await client.query('INSERT INTO borrow_projects(user_id,template_id,name) VALUES($1,$2,$3) RETURNING id',[req.user.id,templateId,name]);
    for(const [order,item] of items.entries()) await client.query('INSERT INTO borrow_project_items(project_id,label,icon,terms,sort_order,owned) VALUES($1,$2,$3,$4,$5,$6)',[project.id,item.label,item.icon,JSON.stringify(item.terms),order,!!item.owned]);
    return project.id;
  });
  res.status(201).json({id});
}));
router.param('id',(req,res,next,id)=>UUID.test(id)?next():res.status(400).json({error:'Invalid project'}));
router.get('/:id', wrap(async(req,res)=> {
  const {rows:[project]}=await query('SELECT id,name,template_id AS "templateId",target_date::text AS "targetDate" FROM borrow_projects WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);
  if(!project) return res.status(404).json({error:'Project not found'});
  await withTransaction(client => reconcileProjectExchanges(client, project.id, req.user.id));
  const {rows:items}=await query(`SELECT i.id,i.label,i.icon,i.terms,i.owned,i.optional,i.transaction_id AS "transactionId",
    t.status AS "transactionStatus",t.requested_end_date AS "endDate",l.title AS "listingTitle"
    FROM borrow_project_items i LEFT JOIN borrow_transactions t ON t.id=i.transaction_id AND t.borrower_id=$2
    LEFT JOIN listings l ON l.id=t.listing_id WHERE i.project_id=$1 ORDER BY i.sort_order,i.id`,[project.id,req.user.id]);
  const inventory=await candidates(req.user.id,items.flatMap(i=>i.terms));
  res.json({...project,items:items.map(i=>nearbyMatches(i, inventory))});
}));
router.post('/:id/items', wrap(async(req,res)=> {
  const label=typeof req.body.label==='string'?req.body.label.trim():'';
  if(!label || label.length>60) return res.status(400).json({error:'Use a name between 1 and 60 characters'});
  const result=await withTransaction(async client=> {
    const {rows:[project]}=await client.query('SELECT id FROM borrow_projects WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id]);
    if(!project) throw Object.assign(new Error('Project not found'),{status:404});
    const {rows:[count]}=await client.query('SELECT count(*)::integer AS count, COALESCE(MAX(sort_order),-1)+1 AS "nextOrder" FROM borrow_project_items WHERE project_id=$1',[project.id]);
    if(count.count>=20) throw Object.assign(new Error('A project can have up to 20 items.'),{status:400});
    return client.query("INSERT INTO borrow_project_items(project_id,label,icon,terms,sort_order) VALUES($1,$2,'basket',$3,$4) RETURNING id",[project.id,label,JSON.stringify([label.toLowerCase()]),count.nextOrder]);
  });
  res.status(201).json(result.rows[0]);
}));
router.patch('/:id/items/:itemId', wrap(async(req,res)=> {
  if(req.body.label!==undefined) {
    const label=typeof req.body.label==='string'?req.body.label.trim():'';
    if(!UUID.test(req.params.itemId)||!label||label.length>60||req.body.owned!==undefined)return res.status(400).json({error:'Use an item name between 1 and 60 characters.'});
    const known=PROJECTS.flatMap(p=>p.items).find(i=>i.label.toLowerCase()===label.toLowerCase());
    await withTransaction(async client=> {
      const {rows:[project]}=await client.query('SELECT id FROM borrow_projects WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id]);
      if(!project)throw Object.assign(new Error('Project not found'),{status:404});
      const {rows:[item]}=await client.query('SELECT id,transaction_id FROM borrow_project_items WHERE id=$1 AND project_id=$2 FOR UPDATE',[req.params.itemId,project.id]);
      if(!item)throw Object.assign(new Error('Checklist item not found'),{status:404});
      if(item.transaction_id)throw Object.assign(new Error('This item has an exchange. Add a new checklist item instead.'),{status:409});
      const {rows:[duplicate]}=await client.query('SELECT id FROM borrow_project_items WHERE project_id=$1 AND id!=$2 AND LOWER(label)=LOWER($3)',[project.id,item.id,label]);
      if(duplicate)throw Object.assign(new Error('That item is already on your list.'),{status:409});
      await client.query('UPDATE borrow_project_items SET label=$2,icon=$3,terms=$4 WHERE id=$1',[item.id,label,known?.icon||'basket',JSON.stringify(known?.terms||[label.toLowerCase()])]);
    });
    return res.json({success:true});
  }
  if(!UUID.test(req.params.itemId) || typeof req.body.owned!=='boolean') return res.status(400).json({error:'Invalid checklist update'});
  const {rows}=await query(`UPDATE borrow_project_items i SET owned=$3 FROM borrow_projects p
    WHERE i.id=$1 AND p.id=i.project_id AND p.id=$4 AND p.user_id=$2 AND i.transaction_id IS NULL RETURNING i.id`,[req.params.itemId,req.user.id,req.body.owned,req.params.id]);
  if(!rows.length) return res.status(409).json({error:'This item changed. Refresh your project.'});
  res.json({success:true});
}));
router.post('/:id/items/:itemId/reset', wrap(async(req,res)=> {
  if(!UUID.test(req.params.itemId)) return res.status(400).json({error:'Invalid checklist item'});
  const {rows}=await query(`UPDATE borrow_project_items i SET transaction_id=NULL,owned=false FROM borrow_projects p,borrow_transactions t
    WHERE i.id=$1 AND p.id=i.project_id AND p.id=$3 AND p.user_id=$2 AND t.id=i.transaction_id
    AND t.status IN ('cancelled','declined','expired','returned','completed') RETURNING i.id`,[req.params.itemId,req.user.id,req.params.id]);
  if(!rows.length) return res.status(409).json({error:'Finish or cancel the exchange before finding another item.'});
  res.json({success:true});
}));
router.post('/:id/items/:itemId/exchange', wrap(async(req,res)=> {
  if(!UUID.test(req.params.itemId)||!UUID.test(req.body.transactionId||''))return res.status(400).json({error:'Choose an exchange for this checklist item.'});
  await withTransaction(async client=> {
    const {rows:[project]}=await client.query('SELECT id FROM borrow_projects WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id]);
    if(!project)throw Object.assign(new Error('Project not found'),{status:404});
    const {rows:[item]}=await client.query('SELECT id,owned,transaction_id FROM borrow_project_items WHERE id=$1 AND project_id=$2 FOR UPDATE',[req.params.itemId,project.id]);
    if(!item)throw Object.assign(new Error('Checklist item not found'),{status:404});
    if(item.transaction_id===req.body.transactionId)return;
    if(item.owned||item.transaction_id)throw Object.assign(new Error('This item is already covered. Refresh your plan.'),{status:409});
    const {rows:[exchange]}=await client.query(`SELECT t.id FROM borrow_transactions t JOIN listings l ON l.id=t.listing_id
      WHERE t.id=$1 AND t.borrower_id=$2 AND t.status IN ('pending','approved','paid','picked_up','return_pending')
      AND COALESCE(l.listing_type,'lend')='lend' AND l.is_free=true
      AND COALESCE(l.price_per_day,0)=0 AND COALESCE(l.deposit_amount,0)=0 FOR SHARE OF t`,[req.body.transactionId,req.user.id]);
    if(!exchange)throw Object.assign(new Error('Active borrow not found'),{status:404});
    const {rows:[duplicate]}=await client.query('SELECT id FROM borrow_project_items WHERE project_id=$1 AND transaction_id=$2',[project.id,exchange.id]);
    if(duplicate)throw Object.assign(new Error('That exchange is already on this plan.'),{status:409});
    await client.query('UPDATE borrow_project_items SET transaction_id=$2 WHERE id=$1',[item.id,exchange.id]);
  });
  res.json({success:true});
}));
router.delete('/:id/items/:itemId', wrap(async(req,res)=> {
  if(!UUID.test(req.params.itemId)) return res.status(400).json({error:'Invalid checklist item'});
  const {rows}=await query(`DELETE FROM borrow_project_items i USING borrow_projects p
    WHERE i.id=$1 AND i.project_id=p.id AND p.id=$2 AND p.user_id=$3 RETURNING i.id`,[req.params.itemId,req.params.id,req.user.id]);
  if(!rows.length) return res.status(404).json({error:'Checklist item not found'});
  res.json({success:true}); // Removing a slot leaves its request/exchange intact.
}));
router.delete('/:id', wrap(async(req,res)=> {
  await query('DELETE FROM borrow_projects WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);
  res.json({success:true}); // Deleting the checklist never cancels its exchanges.
}));
export default router;
