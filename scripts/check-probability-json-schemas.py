#!/usr/bin/env python3
"""Supplemental, independent Draft 2020-12 check when python-jsonschema is installed.
Canonical Zod generation and AJV remain the required full gate.
"""
import json
from pathlib import Path
from jsonschema import Draft202012Validator
ROOT=Path(__file__).resolve().parents[1]
dir_=ROOT/'packages/contracts/schemas'
files=sorted(dir_.glob('*Schema.json'))
assert len(files)==88,(len(files),'expected 88 schemas')
for f in files: Draft202012Validator.check_schema(json.loads(f.read_text()))
v=json.loads((ROOT/'tests/fixtures/probability/vectors.json').read_text())
pack=json.loads((ROOT/'tests/fixtures/probability/model-spec.json').read_text())
req=json.loads((ROOT/'tests/fixtures/probability/request-sample.json').read_text())
normal=json.loads((ROOT/'tests/fixtures/probability/request-normalise.json').read_text())
ctx={k:v for k,v in normal.items() if k!='kind'}
valid=[('ProbabilityPack',pack),('ProbabilityContext',ctx),('ProbabilityRequest',req),
       ('ProbabilityRequest',normal),('SampleCategoryRequest',req),('NormaliseCategoriesRequest',normal),
       ('LegalityFeatureInput',{'controlRating':80,'fatigueBp':2000,'line':'LEG','effort':'MAXIMUM'}),
       ('ContactFeatureInput',{'phase':'T20_LATE','defenceRating':70,'timingRating':40,
                               'powerRating':80,'effectiveMovementBp':5000,'aggression':4})]
invalid=[('LegalityFeatureInput',{'controlRating':101,'fatigueBp':2000,'line':'LEG','effort':'MAXIMUM'}),
         ('ContactFeatureInput',{'phase':'T20_LATE','defenceRating':70,'timingRating':40,
                                 'powerRating':80,'effectiveMovementBp':20000,'aggression':4}),
         ('NormaliseCategoriesRequest',{**normal,'unknown':1})]
for name,obj in valid:
 Draft202012Validator(json.loads((dir_/(name+'Schema.json')).read_text())).validate(obj)
for name,obj in invalid:
 assert not Draft202012Validator(json.loads((dir_/(name+'Schema.json')).read_text())).is_valid(obj),name
print(f'PASS {len(files)} Draft 2020-12 schemas; {len(valid)} valid and {len(invalid)} invalid probability payloads')
