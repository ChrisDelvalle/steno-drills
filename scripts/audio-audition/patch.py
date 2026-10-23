"""Publish approved repairs without re-encoding the rest of the collection."""
import copy
import json
import generate as base
from approved import load, append, policy_hash


def compact_sprites(manifest):
    used = sorted({c['sprite'] for c in manifest['clips']})
    positions = {old: new for new, old in enumerate(used)}
    manifest['sprites'] = [manifest['sprites'][i] for i in used]
    for clip in manifest['clips']: clip['sprite'] = positions[clip['sprite']]


def assert_unchanged(before, after, changed):
    def keyed(m):
        return {c['word']+'|'+c['phones']: {**c, 'sprite': m['sprites'][c['sprite']]} for c in m['clips']}
    old, new = keyed(before), keyed(after)
    if old.keys() != new.keys(): raise ValueError('Repair patch changed vocabulary membership')
    for key in old.keys() - changed:
        if old[key] != new[key]: raise ValueError('Repair patch changed another recording: ' + key)


def main():
    root = base.ROOT
    published = json.loads((root/'data/audio/published.json').read_text())['manifest']
    before = json.loads((root/('public'+published)).read_text())
    manifest = copy.deepcopy(before)
    catalog_bytes = (root/'data/audio/catalog.json').read_bytes(); catalog = json.loads(catalog_bytes)
    records = json.loads((base.WORK/'production/records.json').read_text())
    quality = json.loads((root/'data/audio/quality.json').read_text())
    provenance = json.loads((root/'data/audio/provenance.json').read_text())
    if quality['manifest'] != published or records['recipeHash'] != manifest['recipeHash'] or quality['acousticPolicySha256'] != policy_hash():
        raise ValueError('Repair baseline or review policy is stale')
    targets = [v for v in catalog['variants'] if v.get('reviewedRecording') and json.loads((root/v['reviewedRecording']['metadata']).read_text())['version'] == 2]
    changed = {v['id'] for v in targets}
    if not changed: raise ValueError('No approved repairs to publish')
    original_order = [c['word']+'|'+c['phones'] for c in before['clips']]
    if set(original_order) != {v['id'] for v in catalog['variants']} or before['fallback']:
        raise ValueError('Repairs require an existing collection with full coverage')
    manifest['clips'] = [c for c in manifest['clips'] if c['word']+'|'+c['phones'] not in changed]
    for item in targets:
        record = records['records'][item['id']]
        if record.get('status') != 'ready' or record['spec'] != base.production_spec(records['recipeHash'],item):
            raise ValueError('Approved source is stale: ' + item['id'])
        _, _, data, _ = load(item, records['recipeHash'])
        append(manifest,quality['results'],item,data,record)
    clips = {c['word']+'|'+c['phones']: c for c in manifest['clips']}
    manifest['clips'] = [clips[key] for key in original_order]
    compact_sprites(manifest)
    assert_unchanged(before,manifest,changed)
    manifest['catalogSha256'] = base.digest(catalog_bytes)
    content = (json.dumps(manifest,separators=(',',':'))+'\n').encode()
    filename = 'catalog.'+base.digest(content)+'.json'
    url = '/audio/instructor/'+filename
    if url == published:
        print('Approved recordings are already published; no changes.')
        return
    (root/'public/audio/instructor'/filename).write_bytes(content)
    quality['manifest'] = url
    provenance.update(catalogSha256=manifest['catalogSha256'],sprites=len(manifest['sprites']),audioBytes=sum(s['bytes'] for s in manifest['sprites']))
    provenance['listeningReview'] = {'approvalBatch':'data/audio/repairs/listening-2026-10-23.json',
        'approvalBatchSha256':base.digest((root/'data/audio/repairs/listening-2026-10-23.json').read_bytes()),
        'previousManifest':published,'replacements':len(changed),'preservedVariants':len(original_order)-len(changed),
        'method':'Complete recordings selected by owner listening approval; fixed assets retained without re-encoding other recordings'}
    base.write_json(root/'data/audio/quality.json',quality)
    base.write_json(root/'data/audio/provenance.json',provenance)
    base.write_json(root/'data/audio/published.json',{'manifest':url})
    keep = {filename,*[s['url'].split('/')[-1] for s in manifest['sprites']]}
    for path in (root/'public/audio/instructor').iterdir():
        if path.suffix in ['.json','.opus','.flac'] and path.name not in keep: path.unlink()
    print(json.dumps(provenance['listeningReview'],indent=2))


if __name__ == '__main__': main()
