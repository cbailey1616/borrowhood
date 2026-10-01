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
