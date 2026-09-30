"""Build ten App Store promotional pages from current native captures."""
import hashlib
import json
from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

source, output = map(Path, sys.argv[1:3])
output.mkdir(parents=True, exist_ok=True)
mobile = Path(__file__).resolve().parents[1]
fonts = mobile / 'node_modules/@expo-google-fonts/dm-sans'
slides = [
 ('01-nearby','More nearby.\nLess to buy.','Borrow, find giveaways, or buy from neighbors.',['01-home']),
 ('02-ideas','Make a little\nhappen.','Friendly ideas for projects, outings, and everyday life.',['02-ideas']),
 ('03-plans','Your idea.\nYour checklist.','Create a plan, add what you need, and find it nearby.',['03-plan']),
 ('04-exchanges','Know what\nhappens next.','Track requests, pickups, and returns in one place.',['04-exchange']),
 ('05-items','Your things,\nall together.','Manage items, wanted posts, requests, and saved finds.',['05-my-items']),
 ('06-messages','Keep the details\nin the thread.','Arrange the handoff with replies, photos, and reactions.',['07-thread']),
 ('07-wanted','Need something?\nAsk around.','Post a wanted request and hear from neighbors.',['08-request']),
 ('08-community','A neighborhood\nthat shares.','Find your neighborhood, chat, and connect with friends.',['09-neighborhood','10-friends']),
 ('09-trust','Get to know\nyour neighbors.','Identity verification, endorsements, and community ranks.',['11-profile','12-ranks']),
 ('10-give-sell','Pass it on.\nMake room.','Give things a new home or list them for sale.',['13-giveaway','14-sale']),
]
parchment, ink, green = '#F3EBDD', '#343E35', '#42594C'
def font(weight,size):
    return ImageFont.truetype(str(fonts / f'{weight}{"Bold" if weight==700 else "Regular"}' / f'DMSans_{weight}{"Bold" if weight==700 else "Regular"}.ttf'),size)
def wrap(draw,text,f,width):
    lines=[]
    for paragraph in text.split('\n'):
        line=''
        for word in paragraph.split():
            candidate=(line+' '+word).strip()
            if line and draw.textlength(candidate,font=f)>width:
                lines.append(line);line=word
            else:line=candidate
        lines.append(line)
    return lines
manifest=[]
for device,size in [('iphone-pro-max',(1284,2778)),('ipad-pro-13',(2064,2752))]:
    directory=output/device;directory.mkdir(exist_ok=True)
    w,h=size; scale=w/1284
    for slug,title,subtitle,shots in slides:
        canvas=Image.new('RGB',size,parchment);d=ImageDraw.Draw(canvas)
        d.ellipse((-w*.35,h*.8,w*.85,h*1.18),fill='#DCE5D5')
        d.ellipse((w*.45,h*.83,w*1.5,h*1.23),fill='#C4D2B8')
        d.ellipse((w*.81,50*scale,w*1.08,400*scale),fill='#EDDEC0')
        margin=int(76*scale)
        logo=Image.open(mobile/'src/assets/icon.png').convert('RGB');logo.thumbnail((int(68*scale),int(68*scale)))
        canvas.paste(logo,(margin,int(63*scale)))
        d.text((margin+int(86*scale),int(68*scale)),'Borrowhood',font=font(700,int(37*scale)),fill=green)
        headline=font(700,int(90*scale if len(shots)==1 or device=='iphone-pro-max' else 80*scale))
        y=int(180*scale)
        for line in title.split('\n'):
            d.text((margin,y),line,font=headline,fill=ink);y+=int(headline.size*1.08)
        y+=int(26*scale)
        sub=font(400,int(33*scale))
        for line in wrap(d,subtitle,sub,w-2*margin):
            d.text((margin,y),line,font=sub,fill='#5D6659');y+=int(sub.size*1.3)
        top=y+int(75*scale);bottom=h-int(85*scale)
        # Two captures remain readable; phone pairs use a staggered arrangement.
        paired=len(shots)>1
        for index,name in enumerate(shots):
            shot=Image.open(source/device/(name+'.png')).convert('RGB')
            maxw=(w-2*margin) if not paired else int(w*.48 if device=='iphone-pro-max' else (w-2*margin-int(40*scale))/2)
            maxh=bottom-top-int(170*scale if paired and device=='iphone-pro-max' else 0)
            ratio=min(maxw/shot.width,maxh/shot.height)
            sw,sh=int(shot.width*ratio),int(shot.height*ratio)
            shot=shot.resize((sw,sh),Image.Resampling.LANCZOS)
            x=(w-sw)//2 if not paired else (int(30*scale) if index==0 else w-sw-int(30*scale))
            sy=top+(int(170*scale) if paired and index==1 and device=='iphone-pro-max' else 0)
            radius=int(44*scale);pad=int(10*scale)
            shadow=Image.new('RGBA',size);sd=ImageDraw.Draw(shadow);sd.rounded_rectangle((x-pad,sy-pad+15,x+sw+pad,sy+sh+pad+15),radius+pad,fill=(46,60,42,50));shadow=shadow.filter(ImageFilter.GaussianBlur(int(22*scale)));canvas=Image.alpha_composite(canvas.convert('RGBA'),shadow).convert('RGB');d=ImageDraw.Draw(canvas)
            d.rounded_rectangle((x-pad,sy-pad,x+sw+pad,sy+sh+pad),radius+pad,fill='#42594C')
            mask=Image.new('L',(sw,sh));ImageDraw.Draw(mask).rounded_rectangle((0,0,sw,sh),radius,fill=255)
            canvas.paste(shot,(x,sy),mask)
        target=directory/(slug+'.png');canvas.save(target,optimize=True)
        manifest.append({'file':str(target.relative_to(output)),'width':w,'height':h,'sourceCaptures':shots,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
# A contact sheet lets all ten phone pages be reviewed together.
thumbw=300;thumbh=round(2778/1284*thumbw)
board=Image.new('RGB',(5*thumbw,2*thumbh),parchment)
for index,(slug,*_) in enumerate(slides):
    thumb=Image.open(output/'iphone-pro-max'/(slug+'.png'));thumb.thumbnail((thumbw,thumbh));board.paste(thumb,((index%5)*thumbw,(index//5)*thumbh))
board.save(output/'Borrowhood-App-Store-Overview.jpg',quality=94)
(output/'promotional-manifest.json').write_text(json.dumps({'nativeCaptureManifest':json.loads((source/'capture-manifest.json').read_text()),'promotionalFiles':manifest},indent=2)+'\n')
(output/'README.txt').write_text('Ten promotional pages per device. iPhone: 1284 x 2778. iPad: 2064 x 2752. Built from current native app captures with fictional sample data. Review both device sets before upload.\n')
print(f'Created {len(manifest)} promotional PNGs and overview.')
