"""Offline M7D protocol tests use SYNTHETIC fixtures, not Cricsheet real data."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def load(name,alias):
    spec = importlib.util.spec_from_file_location(alias,ROOT/'scripts'/name)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

fit = load('m7d-fit-candidate.py','m7d_fit')
acq = load('m7d-acquire.py','m7d_acquire')


def fake_inning(dot_rate=0.4, phase='POWERPLAY'):
    intervals = {'POWERPLAY':36,'MIDDLE':54,'DEATH':30}
    out={p:{'runs':0,'wickets':0,'legalBalls':intervals[p],
            'attempts':intervals[p],'dots':12,'boundaries':6} for p in fit.PHASES}
    out[phase]['dots']=int(intervals[phase]*dot_rate)
    out[phase]['runs'] = intervals[phase]*2
    return {key:sum(out[p][key] for p in fit.PHASES) for key in ('runs','wickets','legalBalls','attempts','dots','boundaries')}|{'phases':out}


def reference(n_train=250,n_hold=250):
    train=[{'matchId':f'tr-{i}','date':f'2024-{i//28+1:02d}-{i%28+1:02d}',
            'first':fake_inning(dot_rate=.9 if i%2==0 else .8)} for i in range(n_train)]
    # Dates must be real and strictly later for test cohort
    held=[{'matchId':f'ho-{i}','date':f'2025-{i//28+1:02d}-{i%28+1:02d}',
           'first':fake_inning(dot_rate=.9 if i%2==0 else .8)} for i in range(n_hold)]
    return {'version':'LC_M7C_CALIBRATION_PROTOCOL_V1','declaredSource':'Cricsheet',
      'sourceZipSha256':'a'*64, 'split':'chronological_by_match_no_date_overlap',
      'licenseNoticePresent':True, 'training':{'rows':train},'heldOut':{'rows':held}}


class M7DTest(unittest.TestCase):
    def test_reproducible_candidate_and_no_gameplay_mutation(self):
        a=fit.fit_evaluate(reference())
        b=fit.fit_evaluate(reference())
        self.assertEqual(a,b)
        self.assertEqual(a['candidate']['version'],fit.MODEL_VERSION)
        self.assertFalse(a['evaluation']['gameplayIntegrationPermitted'])
        self.assertFalse(a['evaluation']['sourceApproved'])
        self.assertEqual(a['evaluation']['heldoutMatches'],250)
        self.assertEqual(set(a['evaluation']['metrics']),set(fit.METRICS))
        self.assertLess(a['evaluation']['metrics']['dot']['phaseModelMinusPooledNllPerAttempt'],0)
    def test_changing_holdout_does_not_change_fit(self):
        original=reference()
        edited=reference()
        edited['heldOut']['rows'][0]['first']['phases']['POWERPLAY']['dots']=0
        edited['heldOut']['rows'][0]['first']['dots']-=int(36*.9)
        a=fit.fit_evaluate(original)
        b=fit.fit_evaluate(edited)
        self.assertEqual(a['candidate'],b['candidate'])
    def test_minimum_cannot_be_weakened(self):
        with self.assertRaisesRegex(ValueError,'minimum match gate'):
            fit.fit_evaluate(reference(),min_matches=10)
        with self.assertRaisesRegex(ValueError,'INSUFFICIENT'):
            fit.fit_evaluate(reference(n_hold=50))
    def test_dates_and_ids_cannot_overlap(self):
        r=reference()
        r['heldOut']['rows'][0]['date']=r['training']['rows'][0]['date']
        with self.assertRaisesRegex(ValueError,'leakage'):
            fit.fit_evaluate(r)
        r=reference()
        r['heldOut']['rows'][0]['matchId']=r['training']['rows'][0]['matchId']
        with self.assertRaisesRegex(ValueError,'leakage'):
            fit.fit_evaluate(r)
    def test_phase_reconciliation_required(self):
        r=reference()
        r['training']['rows'][0]['first']['runs']+=1
        with self.assertRaisesRegex(ValueError,'phase reconciliation'):
            fit.fit_evaluate(r)
    def test_zip_acquirer_requires_licence(self):
        def payload(with_licence):
            stream=io.BytesIO()
            with zipfile.ZipFile(stream,'w',zipfile.ZIP_DEFLATED) as z:
                if with_licence:z.writestr('LICENSE.txt','ODC-By attribution example test only')
                for i in range(400):z.writestr(f'{i}.json','{}')
            return stream.getvalue()
        class Response(io.BytesIO):
            status=200
            def __enter__(self):return self
            def __exit__(self,*a):self.close()
        with tempfile.TemporaryDirectory() as d:
            d=Path(d)
            bad=payload(False)
            with self.assertRaisesRegex(ValueError,'LICENSE'):
                acq.acquire(d/'invalid.zip',d/'bad-manifest.json',opener=lambda *args,**kw:Response(bad))
            self.assertFalse((d/'invalid.zip').exists())
            self.assertFalse((d/'invalid.zip.partial').exists())
            good=payload(True)
            result=acq.acquire(d/'real-test-ONLY.zip',d/'manifest.json',opener=lambda *args,**kw:Response(good))
            self.assertEqual(result['jsonMemberCount'],400)
            self.assertFalse(result['humanDatasetApproval'])
            self.assertTrue((d/'real-test-ONLY.zip').exists())

if __name__=='__main__':unittest.main()
