import { sortDiscussion, removeDiscussionBranch } from '../../src/utils/discussionThread';
const child={id:'child',replyToId:'root',score:2,createdAt:'2026-09-30'};
const grandchild={id:'grandchild',replyToId:'child',score:3,createdAt:'2026-09-30'};
it('removes descendants instead of reattaching them to the root',()=>{
 const result=removeDiscussionBranch([grandchild,child,{id:'sibling',replyToId:'root'}],'child');
 expect(result.items.map(r=>r.id)).toEqual(['sibling']);expect(result.removed.size).toBe(2);
});
it('always sorts oldest first without using scores or mutating its source',()=>{
 const items=[{id:'new',createdAt:'2026-09-30',score:100},{id:'old',createdAt:'2026-01-01',score:0}];
 expect(sortDiscussion(items).map(item=>item.id)).toEqual(['old','new']);
 expect(items.map(item=>item.id)).toEqual(['new','old']);
});
it('breaks equal timestamp ties consistently when pages arrive in different orders',()=>{
 const first={id:'a',createdAt:'2026-09-30'},second={id:'b',createdAt:'2026-09-30'};
 expect(sortDiscussion([second,first])).toEqual([first,second]);
});

const { formatDiscussionTime, discussionInitials, DISCUSSION_LIGHT_COLORS } = require('../../src/utils/discussionThread');
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
it('uses AA secondary text on every light comment surface',()=>{
 const lum=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 for(const surface of ['background','surface','surfaceElevated','primaryMuted']) {
  const pair=[lum(DISCUSSION_LIGHT_COLORS.textMuted),lum(DISCUSSION_LIGHT_COLORS[surface])].sort((a,b)=>b-a);
  expect((pair[0]+.05)/(pair[1]+.05)).toBeGreaterThanOrEqual(4.5);
 }
});
