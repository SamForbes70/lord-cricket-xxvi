#!/usr/bin/env python3
"""Supplemental Python structural mirror check, not the canonical Zod/AJV drift gate."""
from pathlib import Path
from jsonschema import Draft202012Validator
import json
root=Path('packages/contracts/schemas')
files=sorted(root.glob('*Schema.json'))
assert len(files)==88,f'Expected 88 schemas, got {len(files)}'
for f in files:
    Draft202012Validator.check_schema(json.loads(f.read_text()))
read=lambda name: json.loads((root/f'{name}Schema.json').read_text())
request=json.loads(Path('tests/fixtures/generator/base-request.json').read_text())
source=json.loads(Path('docs/verification-pass06/offline-generator-results.json').read_text())
reqValidator=Draft202012Validator(read('GenerateDeliveryRequest'))
assert reqValidator.is_valid(request),list(reqValidator.iter_errors(request))
invalid=[{**request,'surprise':1},
 {**request,'bowling':{**request['bowling'],'variationId':'unsupported'}},
 {**request,'batting':{**request['batting'],'shotSectorWeights':[1,2]}},
 {**request,'field':{**request['field'],'slots':request['field']['slots'][:8]}},
 {**request,'generatorVersion':'LC_CONDITIONAL_DELIVERY_V2'}]
for case in invalid: assert not reqValidator.is_valid(case),case
resValidator=Draft202012Validator(read('GeneratedDelivery'))
validated=0
for key,example in source['examplesByOutcome'].items():
    trace=[]
    for t in example['trace']:
        trace.append({'stageName':t['stageName'],'address':{
          'seed':example['seed'],'domain':'MATCH_DELIVERY',
          'entityId':f"{request['matchId']}:{request['context']['inningsIndex']}",
          'eventOrdinal':request['attemptOrdinal'],'stageName':t['stageName'],
          'drawIndex':t['drawIndex']},
          'draw':t['draw'],'selectedCategoryId':t['selectedCategoryId'],'categories':t['categories']})
    response={'kind':'GENERATED_DELIVERY','generatorVersion':request['generatorVersion'],
       'modelHash':request['modelHash'],'stagePackHash':request['stagePackHash'],
       'internalOnly':True,'trace':trace,'resolution':example['resolution']}
    errors=list(resValidator.iter_errors(response))
    assert not errors,(key,[(e.json_path,e.message) for e in errors])
    assert not resValidator.is_valid({**response,'unexpected':True})
    validated+=1
print(f'PASS 88 Draft 2020-12 schema mirrors; generator 1 valid/5 invalid requests, {validated} distinct real transpiled-source output classes validated, strict extra-field rejection')
