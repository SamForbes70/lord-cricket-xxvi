#!/usr/bin/env python3
"""Independent stdlib audit of the published fictional world; no TS production imports."""
import argparse
import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIR = ROOT / 'packages/data/worlds'
SKILLS = {'defence', 'timing', 'power', 'rotation', 'vsPace', 'vsSpin', 'control', 'movement', 'variation', 'stamina', 'catching', 'groundFielding', 'throwing', 'keeping'}
FORMATS = {'T20','ODI','RED_BALL'}
STYLES = {'FAST','MEDIUM','OFF_SPIN','LEG_SPIN','SLOW_LEFT_ARM','LEFT_ARM_WRIST'}

def parse_strict(data):
    def reject_pairs(pairs):
        out = {}
        for key, val in pairs:
            if key in out: raise ValueError('duplicate JSON key: '+key)
            out[key]=val
        return out
    return json.loads(data,object_pairs_hook=reject_pairs)

def canonical(obj):
    return json.dumps(obj,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf8')

def sha(b): return hashlib.sha256(b).hexdigest()

def audit():
    raw = (DIR/'fictional-eight-01.json').read_bytes()
    world=parse_strict(raw)
    manifest=parse_strict((DIR/'fictional-eight-01.manifest.json').read_bytes())
    vectors=parse_strict((DIR/'world-generation-vectors.json').read_bytes())
    errors = []
    def check(cond,msg):
        if not cond: errors.append(msg)
    check(len(raw)==manifest['worldByteLength'] and sha(raw)==manifest['worldFileSha256'],'file hash/length mismatch')
    check(sha(canonical(world))==manifest['worldCanonicalSha256'],'canonical hash mismatch')
    genraw=(ROOT/'scripts/generate-fictional-world.py').read_bytes()
    check(sha(genraw)==manifest['generatorSourceSha256'],'generator source mismatch')
    source={'generatorVersion':manifest['worldGeneratorVersion'],'seed':manifest['worldSeed'],'generatorSourceSha256':manifest['generatorSourceSha256']}
    check(sha(canonical(source))==manifest['provenanceSourceSha256'],'provenance source hash mismatch')
    players=world['players']; teams=world['teams']; grounds=world['grounds']
    check((len(players),len(teams),len(grounds))==(160,8,8),'world must be 160/8/8')
    ids=[p['playerId'] for p in players]
    check(len(set(ids))==160 and ids==[f'p{i:03d}' for i in range(1,161)],'player IDs invalid')
    check([t['teamId'] for t in teams]==[f'team-{i:02d}' for i in range(1,9)],'team ID convention invalid')
    check([g['groundId'] for g in grounds]==[f'ground-{i:02d}' for i in range(1,9)],'ground ID convention invalid')
    check(len({p['name'] for p in players})==160,'duplicate synthetic name')
    lookup={p['playerId']:p for p in players}
    assigned=[]
    for t in teams:
        squad=t['squadIds'];assigned+=squad
        check(len(squad)==20 and len(set(squad))==20,f'{t["teamId"]}: squad size/duplicates')
        check(all(p in lookup for p in squad),f'{t["teamId"]}: missing reference')
        if not all(p in lookup for p in squad): continue
        members=[lookup[x] for x in squad]
        check(sum(p['role']=='KEEPER' for p in members)>=2,f'{t["teamId"]}: keeper count')
        eligible=[p for p in members if p['role'] in ('BOWLER','ALLROUNDER') and p['bowlingStyle'] is not None]
        check(len(eligible)>=6,f'{t["teamId"]}: bowling-capable count')
        check({p['batHand'] for p in members}=={'R','L'} and {p['bowlHand'] for p in eligible}=={'R','L'},f'{t["teamId"]}: handedness')
    check(len(assigned)==160 and len(set(assigned))==160 and set(assigned)==set(ids),'world: shared or unassigned player')
    for p in players:
        pid=p['playerId']
        check(set(p['skills'])==FORMATS and set(p['exposureBalls'])==FORMATS,f'{pid}: format missing')
        for label, skill in p['skills'].items():
            check(set(skill)==SKILLS and all(type(v)==int and 0<=v<=100 for v in skill.values()),f'{pid}/{label}: bad ratings')
        check(p['variations']==['stock'],f'{pid}: variations invalid')
        check(p['bowlingStyle'] is None or p['bowlingStyle'] in STYLES,f'{pid}: style invalid')
        check(len(p['shotSectorWeights'])==8 and sum(p['shotSectorWeights'])>0 and all(type(v)==int and v>=0 for v in p['shotSectorWeights']),f'{pid}: sector invalid')
        check(p['provenance']=={'kind':'FICTIONAL','sourceId':'fictional-eight-01','sourceHash':manifest['provenanceSourceSha256'],'confidenceBp':3000},f'{pid}: provenance invalid')
        check(p['exposureBalls']=={'T20':0,'ODI':0,'RED_BALL':0},f'{pid}: exposure must be synthetic zero')
    ground_ids={g['groundId'] for g in grounds}
    check(len(ground_ids)==8,'ground IDs invalid')
    for g in grounds:
        check(len(g['sectorRadiiCm'])==8 and all(type(n)==int and n>0 for n in g['sectorRadiiCm']),f'{g["groundId"]}: radius invalid')
        check(0<=g['outfieldSpeedBp']<=10000,f'{g["groundId"]}: speed invalid')
    check(set(manifest['homeGroundIds'])=={t['teamId'] for t in teams} and set(manifest['homeGroundIds'].values())==ground_ids,'home ground mapping invalid')
    check(world['rulesIds']==manifest['rulesIds']==['LC_T20_01','LC_ODI_01','LC_RED5_01'],'rules mismatch')
    for vector in vectors['vectors']:
        a=vector['address']
        check(a['domain']=='WORLD_GENERATION' and a['seed']==manifest['worldSeed'],'wrong random domain/seed')
        payload=[a[k] for k in ('seed','domain','entityId','eventOrdinal','stageName','drawIndex')]
        actual=int.from_bytes(hashlib.sha256(json.dumps(payload,separators=(',',':')).encode()).digest()[:4],'big')
        check(actual==vector['expectedUint32'],'random reference vector mismatched')
    regeneration=subprocess.run(['python3',str(ROOT/'scripts/generate-fictional-world.py'),'--check'],capture_output=True,text=True)
    check(regeneration.returncode==0,'offline world regeneration not byte-identical: '+regeneration.stderr)
    return {'status':'PASS' if not errors else 'FAIL','errors':errors,'counts':{'players':len(players),'teams':len(teams),'grounds':len(grounds),'assignedPlayers':len(assigned),'independentAddressVectors':len(vectors['vectors'])},
            'hashes':{'worldFile':sha(raw),'worldCanonical':sha(canonical(world)),'generatorSource':sha(genraw)},
            'deterministicRegenerationPassed':regeneration.returncode==0}

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=pathlib.Path)
    args=parser.parse_args()
    result=audit()
    if args.output:
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
    if result['status']!='PASS': raise SystemExit(1)
