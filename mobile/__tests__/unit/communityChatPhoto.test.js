import { communityMessageContent, communityPhotoContent } from '../../src/utils/communityChatPhoto';
import { BASE_URL } from '../../src/utils/config';

const url='https://borrowhood-uploads.s3.us-east-1.amazonaws.com/messages/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.jpg';
it('shares photos as readable text and recovers a multiline caption',()=>{
 const content=communityPhotoContent(url,'  Spare ladder\nYou’re welcome to it.  ');
 expect(content).toBe(`📷 ${url}\nSpare ladder\nYou’re welcome to it.`);
 expect(communityMessageContent(content)).toEqual({photoUrl:url,text:'Spare ladder\nYou’re welcome to it.'});
 expect(communityMessageContent(communityPhotoContent(url))).toEqual({photoUrl:url,text:''});
});
it('recognizes the existing local upload URLs',()=>{
 const local=`${BASE_URL}/uploads/22222222-2222-2222-2222-222222222222.jpg`;
 expect(communityMessageContent(communityPhotoContent(local)).photoUrl).toBe(local);
});
it.each(['https://example.com/photo.jpg','file:///photo.jpg','javascript:alert(1)',url+'?redirect=1',url.replace('/messages/','/profiles/')])('keeps unsupported links as text: %s',link=>{
 const content=communityPhotoContent(link,'Caption');
 expect(communityMessageContent(content)).toEqual({text:content,photoUrl:null});
});
it('keeps normal pasted URLs and ordinary emoji messages unchanged',()=>{
 expect(communityMessageContent(url)).toEqual({text:url,photoUrl:null});
 expect(communityMessageContent('Hello! 👋')).toEqual({text:'Hello! 👋',photoUrl:null});
});
