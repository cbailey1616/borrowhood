import { flattenDiscussion, sortDiscussion, removeDiscussionBranch, discussionMentions } from '../../src/utils/discussionThread';
const root={id:'root',score:1,createdAt:'2026-09-30',user:{id:'alice',firstName:'Alice'}};
const child={id:'child',replyToId:'root',score:2,createdAt:'2026-09-30'};
const grandchild={id:'grandchild',replyToId:'child',score:3,createdAt:'2026-09-30'};
it('preserves actual ancestry while allowing individual branches to collapse',()=>{
 const rows=flattenDiscussion([root],{root:[grandchild,child]},new Set(['root']),new Set(),'top');
 expect(rows.map(r=>[r.id,r.depth])).toEqual([['root',0],['child',1],['grandchild',2]]);
 expect(flattenDiscussion([root],{root:[child,grandchild]},new Set(['root']),new Set(['child']),'top').map(r=>r.id)).toEqual(['root','child']);
 expect(flattenDiscussion([root],{root:[child]},new Set(['root']),new Set(['root']),'top')).toHaveLength(1);
});
it('removes descendants instead of reattaching them to the root',()=>{
 const result=removeDiscussionBranch([grandchild,child,{id:'sibling',replyToId:'root'}],'child');
 expect(result.items.map(r=>r.id)).toEqual(['sibling']);expect(result.removed.size).toBe(2);
});
it('sorts without mutating its source',()=>{
 const items=[{id:'old',createdAt:'2026-01-01',score:3},{id:'new',createdAt:'2026-09-30',score:1}];
 expect(sortDiscussion(items,'top')[0].id).toBe('old');expect(sortDiscussion(items,'newest')[0].id).toBe('new');
 expect(sortDiscussion(items,'oldest')[0].id).toBe('old');expect(items[0].id).toBe('old');
});
it('only suggests identities already visible in the discussion',()=>{
 const users=discussionMentions([root],{root:[{user:{id:'bob',firstName:'Bob',lastName:'B.'}}]},{id:'me',displayName:'Chris'});
 expect(users.map(u=>u.handle)).toEqual(['Chris','Alice','BobB']);
});

const { formatDiscussionTime, discussionInitials, composerScrollOffset, DISCUSSION_LIGHT_COLORS } = require('../../src/utils/discussionThread');
it('uses relative times and readable month-day dates',()=>{
 const now=Date.parse('2026-10-01T17:00:00Z');
 expect(formatDiscussionTime('2026-10-01T16:59:45Z',now)).toBe('Just now');
 expect(formatDiscussionTime('2026-10-01T16:55:00Z',now)).toBe('5m ago');
 expect(formatDiscussionTime('2026-10-01T15:00:00Z',now)).toBe('2h ago');
 expect(formatDiscussionTime('2026-09-28T17:00:00Z',now)).toBe('3d ago');
 expect(formatDiscussionTime('2026-09-11T17:00:00Z',now)).toBe('Sep 11');
 expect(formatDiscussionTime('invalid',now)).toBe('');
 expect(formatDiscussionTime('2026-10-02T17:00:00Z',now)).toBe('Just now');
});
it('makes initials from the public name without exposing any other identity',()=>{
 expect(discussionInitials({firstName:'Kate',lastName:'K.'})).toBe('KK');
 expect(discussionInitials({firstName:'Chris Bailey'})).toBe('CB');
 expect(discussionInitials({displayName:'Garden Neighbor',firstName:'Hidden'})).toBe('GN');
 expect(discussionInitials({firstName:'Neighbor'})).toBe('N');
 expect(discussionInitials({})).toBe('N');
});
it('keeps the entire composer above the keyboard using the native viewport',()=>{
 const viewport={y:120,height:400};
 expect(composerScrollOffset(100,viewport,{y:460,height:210})).toBe(258);
 expect(composerScrollOffset(100,viewport,{y:110,height:210})).toBe(82);
 expect(composerScrollOffset(100,viewport,{y:140,height:210})).toBe(100);
 expect(composerScrollOffset(0,{y:0,height:0},{y:140,height:210})).toBe(0);
});
it('uses AA secondary text on every light comment surface',()=>{
 const lum=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 for(const surface of ['background','surface','surfaceElevated','primaryMuted']) {
  const pair=[lum(DISCUSSION_LIGHT_COLORS.textMuted),lum(DISCUSSION_LIGHT_COLORS[surface])].sort((a,b)=>b-a);
  expect((pair[0]+.05)/(pair[1]+.05)).toBeGreaterThanOrEqual(4.5);
 }
});
