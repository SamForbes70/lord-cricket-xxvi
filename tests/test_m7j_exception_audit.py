"""Evidence-based, non-automatic Cricsheet adjudication classification."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from importlib.machinery import SourceFileLoader
module=SourceFileLoader("m7j_audit",str(Path(__file__).resolve().parents[1]/"scripts"/"m7j-exception-audit.py")).load_module()

class M7JExceptionAudit(unittest.TestCase):
    def setUp(self):
        self.rows=[]
        for reason,count in [('UNSUPPORTED_WICKET_TYPE',24),('INVALID_LEGALITY_CHANNEL',21),
         ('UNSUPPORTED_EXTRA_TYPE',11),('FREE_HIT_MASK',5),('MULTI_WICKET_UNSUPPORTED',4),
         ('WIDE_WICKET_MASK',2),('BOUNDARY_DISMISSAL_OR_ALLOWANCE',2)]:
            for i in range(count):
                self.rows.append(dict(reason=reason,matchId=f'{reason}-{i}',innings=1,over=1,attempt=1,
                  sourceEventSha256=f'{i:064x}',cohort='training'))
    def test_all_69_identity_and_reason_counts(self):
        out=module.make_report({'exceptionCount':69,'exceptions':self.rows},'a'*64)
        self.assertEqual(out['exceptionCount'],69)
        self.assertEqual(out['countByReason']['UNSUPPORTED_WICKET_TYPE'],24)
        self.assertEqual(out['countByReason']['WIDE_WICKET_MASK'],2)
        self.assertFalse(out['gameplayIntegrationPermitted'])
        self.assertEqual(out['automaticallyAccepted'],0)
        self.assertTrue(all(not row['autoApproved'] for row in out['exceptions']))
    def test_unknown_reason_fails(self):
        self.rows[0]['reason']='UNKNOWN_NEW_LAW'
        with self.assertRaises(ValueError): module.make_report({'exceptionCount':69,'exceptions':self.rows},'a'*64)
    def test_duplicate_provenance_fails(self):
        self.rows[0]=self.rows[1].copy()
        with self.assertRaises(ValueError):module.make_report({'exceptionCount':69,'exceptions':self.rows},'a'*64)
    def test_no_ball_not_normalized_without_evidence(self):
        out=module.make_report({'exceptionCount':69,'exceptions':self.rows},'a'*64)
        samples=[x for x in out['exceptions'] if x['reason']=='INVALID_LEGALITY_CHANNEL']
        self.assertEqual(len(samples),21)
        self.assertTrue(all(x['disposition']=='UNRESOLVED' for x in samples))
    def test_multi_wickets_not_considered_automatically_supported(self):
        out=module.make_report({'exceptionCount':69,'exceptions':self.rows},'a'*64)
        self.assertTrue(all(x['disposition']=='CONFLICT_REQUIRES_EVENT_ORDER_REVIEW' for x in out['exceptions'] if x['reason']=='MULTI_WICKET_UNSUPPORTED'))

if __name__=='__main__':unittest.main()
