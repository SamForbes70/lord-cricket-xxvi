"""M7E user-uploaded Cricsheet archive is data, not executable or attested download."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec=importlib.util.spec_from_file_location('m7e_register', Path(__file__).resolve().parents[1] / 'scripts' / 'm7e-register-upload.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def archive(*, malicious=False, missing_license=False, bad_readme=False, bad_crc=False):
    mem=io.BytesIO()
    with zipfile.ZipFile(mem,'w',zipfile.ZIP_STORED) as z:
        if not missing_license:
            z.writestr('LICENSE.txt','# ODC Attribution License (ODC-By)')
        z.writestr('README.txt', 'Cricsheet files https://cricsheet.org/downloads/t20s_json.zip' if not bad_readme else 'unknown archive')
        for n in range(400):z.writestr(f'{n}.json','{}')
        if malicious:z.writestr('../unsafe.txt','BAD')
    result=mem.getvalue()
    if bad_crc:
        replacement=result.replace(b'{}',b'[]',1)
        assert replacement!=result
        return replacement
    return result

class TestUploadedSource(unittest.TestCase):
    def run_archive(self,**kwargs):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            src=root/'source.zip';dest=root/'acquisition.json'
            src.write_bytes(archive(**kwargs))
            result=module.register(src,dest)
            self.assertEqual(json.loads(dest.read_text()),result)
            return result
    def test_upload_keeps_source_unverified_and_gameplay_not_approved(self):
        x=self.run_archive()
        self.assertEqual(x['jsonMemberCount'],400)
        self.assertTrue(x['zipCrcAllMembersPassed'])
        self.assertEqual(x['acquisitionMethod'],'USER_UPLOADED_ARCHIVE')
        self.assertFalse(x['networkRetrievalVerified'])
        self.assertFalse(x['archiveAuthenticityIndependentlyVerified'])
        self.assertFalse(x['gameplayModelApproved'])
    def test_rejects_traversal(self):
        with self.assertRaisesRegex(ValueError,'unsafe archive'):
            self.run_archive(malicious=True)
    def test_requires_embedded_license(self):
        with self.assertRaisesRegex(ValueError,'missing license'):
            self.run_archive(missing_license=True)
    def test_requires_declared_readme_source(self):
        with self.assertRaisesRegex(ValueError,'provenance|declared source'):
            self.run_archive(bad_readme=True)
    def test_crc_corruption_is_rejected(self):
        with self.assertRaises((zipfile.BadZipFile,ValueError)):
            self.run_archive(bad_crc=True)
if __name__=='__main__':unittest.main()
