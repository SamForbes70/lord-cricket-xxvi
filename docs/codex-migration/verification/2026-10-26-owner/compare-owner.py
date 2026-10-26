from pathlib import Path
import hashlib,json,zipfile,subprocess,urllib.request,time,os
repo=Path('/workspace/lord-cricket-xxvi'); root=Path('/workspace/owner-release-comparison/original/Lord Cricket XXVI')
out=repo/'docs/codex-migration/verification/2026-10-26-owner'; out.mkdir(parents=True,exist_ok=True)
h=lambda b:hashlib.sha256(b).hexdigest()
a=Path('/workspace/attachments/33e2178d-1b7e-46e9-9ecb-7bc5c8e9de89/Lord_Cricket_XXVI_START_HERE_2026-10-17.zip')
r={'archive_sha256':h(a.read_bytes()),'archive_bytes':a.stat().st_size,'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()}
r['manifest']=[]
for line in (root/'04_NOTES/SHA256SUMS.txt').read_text().splitlines():
 expected,n=line.split('  ',1); actual=h((root/n).read_bytes()); r['manifest'].append({'path':n,'expected':expected,'actual':actual,'pass':actual==expected})
r['zip_crc']={}
for p in [a,*root.rglob('*.zip')]:
 with zipfile.ZipFile(p) as z:r['zip_crc'][p.name]={'entries':len(z.infolist()),'bad_entry':z.testzip()}
z=zipfile.ZipFile(next(root.rglob('*Source.zip'))); r['source_mismatches']=[];count=0
for n in z.namelist():
 if n.endswith('/'):continue
 rel=n.split('/',1)[1];b=subprocess.check_output(['git','show','5b8b9da:'+rel],cwd=repo)
 count+=1
 if b!=z.read(n):r['source_mismatches'].append(rel)
r['source_files_compared']=count
r['bundle_verify']=subprocess.run(['git','bundle','verify',str(next(root.rglob('*.bundle')))],cwd=repo,capture_output=True,text=True).__dict__
r['bundle_verify'].pop('args',None)
r['assets']=[]
old=root/'01_GAME/apps/web/dist'; new=repo/'apps/web/dist'
for p in sorted(old.rglob('*')):
 if p.is_file():
  rel=p.relative_to(old);q=new/rel;r['assets'].append({'path':str(rel),'owner_sha256':h(p.read_bytes()),'rebuilt_sha256':h(q.read_bytes()) if q.exists() else None,'identical':q.exists() and p.read_bytes()==q.read_bytes()})
r['rebuilt_assets']=[{'path':str(p.relative_to(new)),'sha256':h(p.read_bytes())} for p in sorted(new.rglob('*')) if p.is_file()]
servers=[]; r['http']=[]
try:
 for port,cwd in [(4191,root/'01_GAME'),(4192,repo)]:
  log=open(out/f'server-{port}.log','w');p=subprocess.Popen(['node','start.mjs'],cwd=cwd,env={**os.environ,'PORT':str(port)},stdout=log,stderr=log);servers.append((p,log)); dist=cwd/'apps/web/dist'
  for i in range(50):
   try:urllib.request.urlopen(f'http://127.0.0.1:{port}/');break
   except Exception:time.sleep(.1)
  for f in sorted(dist.rglob('*')):
   if f.is_file():
    rel=f.relative_to(dist).as_posix();response=urllib.request.urlopen(f'http://127.0.0.1:{port}/{rel}');b=response.read();r['http'].append({'port':port,'path':rel,'status':response.status,'sha256':h(b),'matches_disk':b==f.read_bytes()})
finally:
 for p,log in servers:p.terminate();p.wait();log.close()
(out/'comparison.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps({'manifest_pass':sum(x['pass'] for x in r['manifest']),'source_count':count,'source_mismatches':r['source_mismatches'],'zip_crc':r['zip_crc'],'bundle':r['bundle_verify'],'assets':r['assets'],'http_count':len(r['http']),'http_pass':all(x['matches_disk'] and x['status']==200 for x in r['http'])},indent=2))
