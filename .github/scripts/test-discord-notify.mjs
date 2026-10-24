import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMetadata, parseReleaseNotes, cardFor, releasePayload, testPayload, validateWebhook } from './notify-discord.mjs';

const item = {
  file: 'BRUHN_MEDIA_LSS_Tools_Manager.user.js',
  name: 'BRUHN MEDIA | LSS – Tools Manager',
  version: '1.0.2', oldVersion: '1.0.1'
};

test('Metadaten werden erkannt', () => {
  assert.equal(getMetadata('// @version      1.0.2\n', 'version'), '1.0.2');
});
test('Deutsche Release-Notizen werden versionsgenau aus der gepflegten Datei gelesen', () => {
  const notes = readFileSync(new URL('../../RELEASE_NOTES.md', import.meta.url), 'utf8');
  assert.deepEqual(parseReleaseNotes(notes, '1.2.0'), [
    'Dashboard, Verbandsverwaltung und Kartensteuerung offiziell veröffentlicht.',
    'Der BRUHN MEDIA Appstore enthält jetzt alle sieben Module.'
  ]);
  assert.deepEqual(parseReleaseNotes(notes, '1.2.1'), []);
  assert.deepEqual(parseReleaseNotes(notes, '1.1.0'), [
    'Das Modul Karten-Layouts mit fünf verschiedenen Ansichten veröffentlicht.',
    'Volle Fensterhöhe, Scrollbereiche und Seitenleisten-Icons verbessert.'
  ]);
});
test('Discord-Ankündigungen übernehmen keine englischen Commit-Titel', () => {
  const payload = releasePayload([{...item, version:'1.2.0'}]);
  const notes = payload.components[0].components[4].content;
  assert.match(notes, /offiziell veröffentlicht/);
  assert.match(notes, /alle sieben Module/);
  assert.doesNotMatch(notes, /seven tested modules|release:|publish/i);
});
test('Fehlen Release-Notizen, erscheint nur ein deutscher Standardtext', () => {
  const card = cardFor(item, []);
  assert.match(card.components[4].content, /Neue Version veröffentlicht/);
  assert.doesNotMatch(card.components[4].content, /seven tested modules/i);
});
test('Karte hat BRUHN MEDIA Farbwert, Versionsdaten und funktionierende Link-Buttons', () => {
  const card = cardFor(item, ['Verbandsfreigabe verbessert']);
  assert.equal(card.type, 17);
  assert.equal(card.accent_color, 0xD93030);
  assert.match(card.components[0].components[0].content, /^## BRUHN MEDIA \| Tools Manager\n/);
  assert.doesNotMatch(card.components[0].components[0].content, /LSS Tools Manager/);
  assert.match(card.components[2].content, /1\.0\.2.*1\.0\.1/);
  assert.match(card.components[4].content, /Verbandsfreigabe verbessert/);
  const links = card.components.find(c => c.type === 1).components;
  assert.equal(links.length, 2);
  assert.ok(links.every(button => button.type === 2 && button.style === 5 && button.url.startsWith('https://')));
  assert.match(links[0].url, /\.user\.js$/);
  assert.match(card.components.at(-1).content, /© 2026 BRUHN MEDIA \| Alle Rechte vorbehalten/);
});
test('Andere Userscripts behalten ihre eigene Bezeichnung', () => {
  const card = cardFor({ ...item, file:'Andere_Hilfe.user.js', name:'Andere Hilfe' }, []);
  assert.match(card.components[0].components[0].content, /^## Andere Hilfe\n/);
});
test('Alter und neuer Tools-Manager-Name erscheinen im Discord einheitlich', () => {
  for (const name of ['BRUHN MEDIA | LSS – Tools Manager', 'BRUHN MEDIA | Tools Manager']) {
    const card = cardFor({...item, name}, []);
    assert.match(card.components[0].components[0].content, /^## BRUHN MEDIA \| Tools Manager\n/);
  }
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
