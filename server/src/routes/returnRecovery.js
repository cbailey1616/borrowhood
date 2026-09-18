import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { body, param, query as checkQuery, validationResult } from 'express-validator';
import { reportNonReturn, extendReturn, returnHelp, respondReturnReport, reviewReturnReport } from '../services/returnRecovery.js';
const router=Router();
router.use(authenticate);
const id=param('id').isUUID();
const text=field=>body(field).isString().trim().isLength({min:10,max:2000});
const version=body('version').isInt({min:0}).toInt();
const run=fn=>async(req,res)=>{
  if(!validationResult(req).isEmpty()) return res.status(400).json({error:'Check your details. Notes must be 10–2,000 characters.'});
  try{res.json(await fn(req));}catch(e){res.status(e.status||500).json({error:e.status?e.message:'Could not save this update. Please refresh and try again.'});}
};
router.get('/',checkQuery('transactionId').optional().isUUID(),checkQuery('page').optional().isInt({min:1,max:10000}),run(req=>returnHelp(req.user.id,false,Number(req.query.page)||1,req.query.transactionId)));
router.get('/admin',requireAdmin,checkQuery('page').optional().isInt({min:1,max:10000}),run(req=>returnHelp(req.user.id,true,Math.max(1,Math.min(10000,Number(req.query.page)||1)))));
router.post('/exchange/:id/report',id,text('detail'),run(req=>reportNonReturn(req.params.id,req.user.id,req.body.detail)));
router.post('/exchange/:id/extend',id,body('date').isDate({format:'YYYY-MM-DD',strictMode:true}),run(req=>extendReturn(req.params.id,req.user.id,req.body.date)));
router.post('/:id/respond',id,text('text'),version,run(req=>respondReturnReport(req.params.id,req.user.id,req.body.text,req.body.version)));
router.post('/:id/appeal',id,text('text'),version,run(req=>respondReturnReport(req.params.id,req.user.id,req.body.text,req.body.version,true)));
router.post('/:id/review',requireAdmin,id,text('note'),version,body('action').isIn(['confirm','dismiss','uphold','overturn','ban','restore']),run(req=>reviewReturnReport(req.params.id,req.user.id,req.body.action,req.body.note,req.body.version)));
export default router;
