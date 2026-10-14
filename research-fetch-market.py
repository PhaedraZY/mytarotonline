import concurrent.futures, json, pathlib, urllib.request, re, html
from html.parser import HTMLParser
ROOT=pathlib.Path(r'E:\VibeCoding\Codex\OC\tarot-atelier\research')
ROOT.mkdir(parents=True,exist_ok=True)
urls=[('labyrinthos','https://labyrinthos.co/'),('biddy','https://biddytarot.com/'),('tarot-com','https://www.tarot.com/'),('galaxy','https://www.galaxytarot.ca/'),('tarotsimple','https://tarotsimple.com/'),('tarotap','https://tarotap.com/en')]
class Extract(HTMLParser):
 def __init__(self): super().__init__();self.parts=[];self.ignore=0
 def handle_starttag(self,tag,attrs):
  if tag in ['script','style','noscript','svg']: self.ignore+=1
  if tag in ['p','div','h1','h2','h3','li','br']: self.parts.append('\n')
 def handle_endtag(self,tag):
  if tag in ['script','style','noscript','svg'] and self.ignore: self.ignore-=1
 def handle_data(self,d):
  if not self.ignore:self.parts.append(d)
def get(item):
 key,url=item
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
  with urllib.request.urlopen(req,timeout=30) as r: raw=r.read().decode('utf-8','replace');status=r.status;final=r.url
  p=Extract();p.feed(raw);txt='\n'.join(s.strip() for s in ''.join(p.parts).splitlines() if s.strip())
  (ROOT/f'{key}.txt').write_text(txt,encoding='utf-8');(ROOT/f'{key}.html').write_text(raw,encoding='utf-8')
  return {'key':key,'url':url,'final_url':final,'accessed':'2026-10-14','status':status,'characters':len(txt),'text_file':f'research/{key}.txt','sample':txt[:700]}
 except Exception as e:return {'key':key,'url':url,'accessed':'2026-10-14','error':str(e)}
results=list(concurrent.futures.ThreadPoolExecutor(max_workers=6).map(get,urls))
(ROOT/'market-sources.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False,indent=2))
