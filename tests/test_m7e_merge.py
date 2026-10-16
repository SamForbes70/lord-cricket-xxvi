"""Synthetic fixed-seed diagnostic shards must preserve sample identity."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('m7e_merge',Path(__file__).resolve().parents[1]/'scripts'/'m7e-merge-synthetic.py')
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def shard(seed,model='frozen-model'):
    phases={n:{'runs':10,'wickets':0,'legalBalls':10,'attempts':10,'dots':2,'boundaries':2} for n in ('POWERPLAY','MIDDLE','DEATH')}
    first={'runs':30,'wickets':0,'legalBalls':30,'attempts':30,'dots':6,'boundaries':6,'phases':phases}
    return {'version':'LC_M7C_SYNTHETIC_FIRST_INNINGS_V1', 'source':'SYNTHETIC_ALPHA',
            'modelId':model,'modelHash':'b'*64,'worldSha256':'c'*64,
            'matches':1,'rows':[{'seed':seed,'first':first,'second':first}]}

class MergeTest(unittest.TestCase):
    def run_merge(self,contents,count):
        with tempfile.TemporaryDirectory() as d:
            paths=[]
            for i,c in enumerate(contents):
                p=Path(d)/f'part{i}.json';p.write_text(json.dumps(c));paths.append(p)
            return mod.merge(paths,count)
    def test_joins_fixed_seeds_in_order(self):
        x=self.run_merge([shard('seed-2'),shard('seed-1')],2)
        self.assertEqual(x['matches'],2)
        self.assertEqual([r['seed'] for r in x['rows']],['seed-1','seed-2'])
        self.assertEqual(x['firstInnings']['meanRuns'],30)
        self.assertFalse(x['runtime']['measuredInBrowser'])
    def test_rejects_duplicate_seeds(self):
        with self.assertRaisesRegex(ValueError,'duplicate simulated seed'):
            self.run_merge([shard('same'),shard('same')],2)
    def test_rejects_model_change(self):
        with self.assertRaisesRegex(ValueError,'different synthetic source'):
            self.run_merge([shard('one'),shard('two','other-model')],2)
    def test_rejects_missing_shard(self):
        with self.assertRaisesRegex(ValueError,'unexpected merged match count'):
            self.run_merge([shard('one')],2)

if __name__=='__main__':unittest.main()
