"""Offline contract and negative tests. All constructed matches are synthetic, not external evidence."""
import importlib.util
import json
import hashlib
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('m7c_calibration',ROOT/'scripts/m7c-calibration.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

def fabricated_match(date, score=1):
    deliveries=[]
    for i in range(120):
        deliveries.append({'batter':'Nobody','bowler':'Anybody','non_striker':'Other',
                          'runs':{'batter':score,'extras':0,'total':score}})
    innings={'team':'Made-up','overs':[{'over':i,'deliveries':deliveries[6*i:6*(i+1)]} for i in range(20)]}
    return {'meta':{'data_version':'1.1.0'},'info':{'match_type':'T20','overs':20,'gender':'male','dates':[date],
            'outcome':{'winner':'Made-up'},'teams':['Made-up','Also made-up']},'innings':[innings,innings]}

class M7CValidationTest(unittest.TestCase):
    def test_parse_valid_full_and_phase_counts(self):
        x=mod.parse_match(json.dumps(fabricated_match('2025-01-01')).encode(),'match01.json')
        self.assertEqual(x['first']['runs'],120)
        self.assertEqual(x['first']['legalBalls'],120)
        self.assertEqual(x['first']['phases']['POWERPLAY']['runs'],36)
        self.assertEqual(x['first']['phases']['MIDDLE']['runs'],54)
        self.assertEqual(x['first']['phases']['DEATH']['runs'],30)
    def test_shortened_first_innings_is_not_silently_treated_as_complete(self):
        m=fabricated_match('2025-01-01');m['innings'][0]['overs']=m['innings'][0]['overs'][:14]
        with self.assertRaisesRegex(ValueError,'unfinished first innings'):
            mod.parse_match(json.dumps(m).encode(),'short.json')
    def test_duplicate_same_date_does_not_cross_split(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'constructed.zip';out=Path(d)/'out.json'
            with zipfile.ZipFile(p,'w',compression=zipfile.ZIP_DEFLATED) as z:
                for i in range(15):
                    date=f'2025-01-{i//3+1:02d}'
                    z.writestr(f'm{i:02}.json',json.dumps(fabricated_match(date)))
            r=mod.extract(p,out,.2,200)
            self.assertFalse(r['holdoutMinMet']);self.assertEqual(r['totalEligible'],15)
            self.assertFalse(set(x['date'] for x in r['training']['rows'])&set(x['date'] for x in r['heldOut']['rows']))
    def test_reject_zip_traversal_and_bomb(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'bad.zip'
            with zipfile.ZipFile(p,'w') as z:z.writestr('../evil.json',json.dumps(fabricated_match('2025-01-01')))
            with self.assertRaisesRegex(ValueError,'unsafe ZIP'):
                mod.extract(p,Path(d)/'out.json',.2,200)
    def test_200_is_necessary_but_never_sufficient_for_model_approval(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);base=mod.parse_match(json.dumps(fabricated_match('2025-01-01')).encode(),'example.json')
            train=[{**base,'date':f'2024-01-{i%28+1:02d}','matchId':f't{i}'} for i in range(200)]
            held=[{**base,'date':f'2025-01-{i%28+1:02d}','matchId':f'h{i}'} for i in range(200)]
            ref={'version':mod.VERSION,'declaredSource':'Cricsheet','sourceZipSha256':'a'*64,'training':{'rows':train},'heldOut':{'rows':held}}
            model={'version':'LC_M7C_SYNTHETIC_FIRST_INNINGS_V1','source':'SYNTHETIC_ALPHA','rows':[{'first':base['first']} for _ in range(200)]}
            result=mod.compare(ref,model,p/'comparison.json',200)
            self.assertEqual(result['status'],'REFERENCE_TARGETS_PASS_BUT_NO_FITTED_MODEL_OR_APPROVAL')
            self.assertFalse(result['approvalGatePassed']);self.assertTrue(result['sampleAdequate'])
    def test_minimum_threshold_cannot_be_weakened(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'constructed.zip'
            with zipfile.ZipFile(p,'w') as z:z.writestr('match.json',json.dumps(fabricated_match('2025-01-01')))
            with self.assertRaisesRegex(ValueError,'less than 200'):
                mod.extract(p,Path(d)/'out.json',.2,0)
    def test_holdout_leakage_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            m=mod.parse_match(json.dumps(fabricated_match('2025-01-01')).encode(),'match.json')
            r={'version':mod.VERSION,'declaredSource':'Cricsheet','sourceZipSha256':'a'*64,
               'training':{'rows':[m]},'heldOut':{'rows':[m]}}
            model={'version':'LC_M7C_SYNTHETIC_FIRST_INNINGS_V1','source':'SYNTHETIC_ALPHA','rows':[{'first':m['first']}]}
            with self.assertRaisesRegex(ValueError,'leakage'):
                mod.compare(r,model,Path(d)/'out.json',200)

if __name__=='__main__':unittest.main()
