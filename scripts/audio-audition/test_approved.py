import copy
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import generate as base
from approved import load
from patch import compact_sprites, assert_unchanged


class ApprovedRecordingTests(unittest.TestCase):
    def setUp(self):
        self.catalog = json.loads((base.ROOT/'data/audio/catalog.json').read_text())
        self.recipe = json.loads((base.ROOT/'data/audio/provenance.json').read_text())['recipeHash']
        self.items = [v for v in self.catalog['variants'] if v.get('reviewedRecording')]

    def test_all_42_approvals_bind_source_asset_and_listening_rating(self):
        self.assertEqual(len(self.items),42)
        for item in self.items:
            with self.subTest(word=item['word']):
                source, decoded, metadata, content = load(item,self.recipe)
                self.assertEqual(len(source),len(decoded))
                self.assertEqual(base.digest(content),metadata['asset']['sha256'])

    def test_rejects_wrong_target_or_recipe(self):
        item = self.items[0]
        with self.assertRaises(ValueError): load(item,'another-recipe')
        with self.assertRaises(ValueError): load({**item,'id':'wrong|W R AO NG'},self.recipe)

    def test_unchanged_likelihood_does_not_waive_lost_phone_in_approved_opus(self):
        item = next(v for v in self.items if v['word']=='seethe')
        metadata = json.loads((base.ROOT/item['reviewedRecording']['metadata']).read_text())
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative in [item['reviewedRecording']['metadata'],metadata['source'],metadata['approval']['file'],'public'+metadata['asset']['url'],'scripts/audio-audition/codec.py','scripts/audio-audition/phonetics.py']:
                target = root/relative; target.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(base.ROOT/relative,target)
            metadata['assetReview']['result'].update(samePhones=False,perPhoneLossIncrease=.01)
            file = root/item['reviewedRecording']['metadata']; file.write_text(json.dumps(metadata))
            changed = {**item,'reviewedRecording':{**item['reviewedRecording'],'sha256':base.digest(file.read_bytes())}}
            with patch.object(base,'ROOT',root), self.assertRaisesRegex(ValueError,'lost a phone'):
                load(changed,self.recipe)


class IncrementalPatchTests(unittest.TestCase):
    def test_compaction_keeps_other_audio_bytes_and_boundaries(self):
        before = {'sprites':[{'sha256':'a'},{'sha256':'b'},{'sha256':'unused'}],
                  'clips':[{'word':'one','phones':'W AH N','sprite':0,'start':20,'end':100},
                           {'word':'two','phones':'T UW','sprite':1,'start':0,'end':90}]}
        after = copy.deepcopy(before)
        after['sprites'].append({'sha256':'replacement'})
        after['clips'][1].update(sprite=3,end=110)
        compact_sprites(after)
        assert_unchanged(before,after,{'two|T UW'})
        self.assertEqual([s['sha256'] for s in after['sprites']],['a','replacement'])
        after['clips'][0]['start'] += 1
        with self.assertRaises(ValueError): assert_unchanged(before,after,{'two|T UW'})
