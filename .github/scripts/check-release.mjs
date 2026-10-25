import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const name='BRUHN_MEDIA_LSS_Tools_Manager';
const user=readFileSync(name+'.user.js','utf8');
const meta=readFileSync(name+'.meta.js','utf8');
const header=user.match(/^\/\/ ==UserScript==\r?\n[\s\S]*?\/\/ ==\/UserScript==/)[0];
assert.equal(meta.trim(),header.trim(),'Metadaten müssen aus demselben Build stammen');
const versions=[...header.matchAll(/^\/\/\s+@version\s+(\S+)/gm)];
assert.equal(versions.length,1);
const version=versions[0][1];
assert.match(version,/^\d+\.\d+\.\d+$/,'Öffentliches Update muss stabile Version sein');
assert.ok(readFileSync('README.md','utf8').includes('Aktuelle Version: '+version));
assert.ok(readFileSync('RELEASE_NOTES.md','utf8').includes('## '+version+'\n'));
for(const [key,suffix] of [['updateURL','.meta.js'],['downloadURL','.user.js']])
  assert.ok(new RegExp('@'+key+'\\s+https://raw\\.githubusercontent\\.com/bruhnmedia/lss-tools-releases/main/'+name.replaceAll('.','\\.')+suffix.replaceAll('.','\\.')+'(?:\\s|$)').test(header));
const sums=readFileSync('SHA256SUMS.txt','utf8').trim().split(/\r?\n/);
assert.equal(sums.length,2);
for(const suffix of ['.user.js','.meta.js']){
  const file=name+suffix;
  const digest=createHash('sha256').update(readFileSync(file)).digest('hex');
  assert.ok(sums.includes(digest+'  '+file),'Prüfsumme stimmt nicht: '+file);
}
assert.ok(readFileSync('LIZENZ.md','utf8').trim());
console.log('Release '+version+': Metadaten, Version, Update-Adressen und Prüfsummen stimmen.');
