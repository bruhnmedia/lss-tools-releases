import test from 'node:test';
import assert from 'node:assert/strict';
import { getMetadata, filterCommitTitles, cardFor, releasePayload, testPayload, validateWebhook } from './notify-discord.mjs';

const item = {
  file: 'BRUHN_MEDIA_LSS_Tools_Manager.user.js',
  name: 'BRUHN MEDIA | LSS – Tools Manager',
  version: '1.0.2', oldVersion: '1.0.1'
};

test('Metadaten werden erkannt', () => {
  assert.equal(getMetadata('// @version      1.0.2\n', 'version'), '1.0.2');
});
test('Generische Upload-Titel werden nicht als Release-Notizen ausgegeben', () => {
  assert.deepEqual(filterCommitTitles(['Add files via upload', 'Verbandsfreigabe verbessert']), ['Verbandsfreigabe verbessert']);
  assert.deepEqual(filterCommitTitles(['Add files via upload']), []);
});
test('Karte hat BRUHN MEDIA Farbwert, Versionsdaten und funktionierende Link-Buttons', () => {
  const card = cardFor(item, ['Verbandsfreigabe verbessert']);
  assert.equal(card.type, 17);
  assert.equal(card.accent_color, 0xD93030);
  assert.match(card.components[0].components[0].content, /BRUHN MEDIA \| LSS Tools Manager/);
  assert.match(card.components[2].content, /1\.0\.2.*1\.0\.1/);
  assert.match(card.components[4].content, /Verbandsfreigabe verbessert/);
  const links = card.components.find(c => c.type === 1).components;
  assert.equal(links.length, 2);
  assert.ok(links.every(button => button.type === 2 && button.style === 5 && button.url.startsWith('https://')));
  assert.match(links[0].url, /\.user\.js$/);
  assert.match(card.components.at(-1).content, /© 2026 BRUHN MEDIA \| Alle Rechte vorbehalten/);
});
test('Unbekannte Änderungen werden nicht erfunden', () => {
  const card = cardFor(item);
  assert.match(card.components[4].content, /GitHub-Änderungsverlauf/);
  assert.doesNotMatch(card.components[4].content, /Add files via upload/);
});
test('Payload nutzt ausschließlich Discord Components V2', () => {
  const payload = releasePayload([item], () => []);
  assert.equal(payload.flags, 32768);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.equal(payload.components.length, 1);
  assert.ok(!('embeds' in payload));
  assert.ok(!('content' in payload));
  assert.match(payload.username, /BRUHN MEDIA \|/);
});
test('Ein manueller Test ist keine Release-Ankündigung', () => {
  const payload = testPayload();
  const text = JSON.stringify(payload.components);
  assert.match(text, /Verbindungstest/);
  assert.match(text, /keine neue Veröffentlichung/);
  assert.doesNotMatch(text, /1\.0\.2/);
});
test('Webhook-URL erlaubt keine unpassende Adresse oder Abfrageparameter', () => {
  const valid = 'https://discord.com/api/webhooks/12345/ABC_def';
  assert.equal(validateWebhook(valid), valid);
  assert.throws(() => validateWebhook(valid + '/github'));
  assert.throws(() => validateWebhook(valid + '?wait=true'));
  assert.throws(() => validateWebhook('https://example.org/api/webhooks/12345/ABC_def'));
});
