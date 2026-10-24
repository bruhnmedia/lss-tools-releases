#!/usr/bin/env node
/*
 * BRUHN MEDIA | Discord Versionsupdates
 * © 2026 BRUHN MEDIA | Alle Rechte vorbehalten.
 * Läuft ohne externe Pakete. Webhook-Adresse und Token niemals ausgeben.
 * Push: Nur neue @version-Werte in *.user.js im Stammverzeichnis melden.
 * workflow_dispatch: ausdrücklich gekennzeichnete TEST-Nachricht senden.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = process.env.REPOSITORY || '';
const eventName = process.env.EVENT_NAME || '';
const before = process.env.BEFORE_SHA || '';
const after = process.env.AFTER_SHA || 'HEAD';
const hook = process.env.DISCORD_WEBHOOK_URL || '';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function getMetadata(content, name) {
  const match = String(content).match(new RegExp('^\\/\\/[ \\t]*@' + name + '[ \\t]+(.+)$', 'm'));
  return match ? match[1].trim() : '';
}
function previousFile(path) {
  if (!isExistingCommit(before)) return '';
  try { return git(['show', before + ':' + path]); }
  catch { return ''; }
}
function isExistingCommit(ref) {
  if (!/^[0-9a-f]{40}$/.test(ref) || /^0+$/.test(ref)) return false;
  try { git(['rev-parse', '--verify', ref + '^{commit}']); return true; }
  catch { return false; }
}
function safeSummary(value, max = 350) {
  return String(value).replace(/[\r\n]+/g, ' ').replace(/@/g, '@\u200b').slice(0, max);
}
function validateWebhook(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['discord.com', 'discordapp.com'].includes(url.hostname) ||
        !/^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) ||
        url.search || url.hash || url.username || url.password) throw new Error('invalid');
    return value;
  } catch {
    throw new Error('DISCORD_WEBHOOK_URL fehlt oder ist ungueltig: die normale Discord-Webhook-URL ohne /github verwenden.');
  }
}
function updatedScripts() {
  const validBefore = isExistingCommit(before);
  const paths = validBefore
    ? git(['diff', '--name-only', '--diff-filter=AM', before, after, '--', '*.user.js'])
    : git(['ls-tree', '-r', '--name-only', after, '--', '*.user.js']);
  const changed = paths.split('\n').filter(x => /^[A-Za-z0-9_+-]+\.user\.js$/.test(x));
  return changed.flatMap(file => {
    const now = readFileSync(file, 'utf8');
    const version = getMetadata(now, 'version');
    if (!version) throw new Error('Keine @version-Angabe in ' + file);
    const oldVersion = getMetadata(previousFile(file), 'version');
    if (oldVersion === version) return [];
    return [{
      file,
      name: getMetadata(now, 'name') || file,
      version,
      oldVersion,
    }];
  });
}
// Discord Components V2: echte Karte, rote Akzentleiste und Link-Buttons.
// Anders als Bildmockups bleiben Text, Links und Versionen dynamisch.
const BRAND_RED = 0xD93030;
const BRAND_AVATAR = 'https://github.com/bruhnmedia.png';
const BRAND_FOOTER = '© 2026 BRUHN MEDIA | Alle Rechte vorbehalten.';

function inlineText(value, max = 180) {
  return String(value).replace(/[\r\n\t]+/g, ' ').replace(/[@*_~\u0060\[\]<>]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}
function safeVersion(value) {
  return inlineText(value || 'Erstveröffentlichung', 40).replace(/[^a-zA-Z0-9.+_-]/g, '');
}
// Release-Hinweise werden ausschließlich aus der redaktionell gepflegten
// deutschen Datei übernommen – niemals automatisch aus Git-Commit-Titeln.
function parseReleaseNotes(source, version) {
  let inside = false;
  const notes = [];
  for (const line of String(source).split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      if (inside) break;
      inside = heading[1] === version;
      continue;
    }
    if (!inside) continue;
    const bullet = /^[-*]\s+(.+)/.exec(line.trim());
    if (bullet) {
      const note = inlineText(bullet[1], 170);
      if (note) notes.push(note);
      if (notes.length >= 2) break;
    }
  }
  return notes;
}
function releaseNotes(item) {
  try {
    const path = resolve(dirname(fileURLToPath(import.meta.url)), '../../RELEASE_NOTES.md');
    return parseReleaseNotes(readFileSync(path, 'utf8'), item.version);
  } catch {
    return [];
  }
}
function cardFor(item, titles = []) {
  if (!/^[-\w]+\/[-.\w]+$/.test(repo)) throw new Error('Ungueltiger Repositoryname');
  if (!/^[A-Za-z0-9_+-]+\.user\.js$/.test(item.file)) throw new Error('Ungueltiger Scriptname');
  const raw = 'https://raw.githubusercontent.com/' + repo + '/main/' + encodeURIComponent(item.file);
  const changes = 'https://github.com/' + repo + '/commits/main/' + encodeURIComponent(item.file);
  // Einheitlicher Produktname; der Dateiname und die Userscript-Metadaten bleiben unverändert.
  const headline = item.file === 'BRUHN_MEDIA_LSS_Tools_Manager.user.js'
    ? 'BRUHN MEDIA | Tools Manager'
    : inlineText(item.name, 165);
  const notes = titles.length ? titles.slice(0, 2).map(t => '• ' + inlineText(t, 170)).join('\n') :
    'Neue Version veröffentlicht. Weitere Details findest Du im GitHub-Änderungsverlauf.';
  const tick = String.fromCharCode(96);
  return {
    type: 17, accent_color: BRAND_RED, components: [
      { type: 9, components: [
        { type: 10, content: '## ' + headline + '\nEine neue Version ist verfügbar.' }
      ], accessory: { type: 11, media: { url: BRAND_AVATAR }, description: 'BRUHN MEDIA Logo' } },
      { type: 14, divider: true, spacing: 1 },
      { type: 10, content: '**Version**  ' + tick + safeVersion(item.version) + tick +
          '  |  **Vorher**  ' + tick + safeVersion(item.oldVersion) + tick },
      { type: 14, divider: false, spacing: 1 },
      { type: 10, content: '**Änderungen**\n' + notes },
      { type: 1, components: [
        { type: 2, style: 5, label: 'Userscript installieren', url: raw },
        { type: 2, style: 5, label: 'Änderungen ansehen', url: changes },
      ] },
      { type: 14, divider: true, spacing: 1 },
      { type: 10, content: '-# ' + BRAND_FOOTER }
    ]
  };
}
function testCard() {
  return {
    type: 17, accent_color: BRAND_RED, components: [
      { type: 9, components: [{ type: 10,
        content: '## BRUHN MEDIA | Verbindungstest\nDie GitHub-Discord-Verbindung funktioniert.\n**Dies ist keine neue Veröffentlichung.**'
      }], accessory: { type: 11, media: { url: BRAND_AVATAR }, description: 'BRUHN MEDIA Logo' } },
      { type: 14, divider: true, spacing: 1 },
      { type: 1, components: [{ type: 2, style: 5,
        label: 'GitHub-Repository öffnen', url: 'https://github.com/' + repo }] },
      { type: 10, content: '-# ' + BRAND_FOOTER }
    ]
  };
}
function releasePayload(items, changesFor = releaseNotes) {
  return {
    username: 'BRUHN MEDIA | GitHub Updates', avatar_url: BRAND_AVATAR,
    flags: 32768, components: items.slice(0, 10).map(item => cardFor(item, changesFor(item))),
    allowed_mentions: { parse: [] }
  };
}
function testPayload() {
  if (!/^[-\w]+\/[-.\w]+$/.test(repo)) throw new Error('Ungueltiger Repositoryname');
  return {
    username: 'BRUHN MEDIA | GitHub Updates', avatar_url: BRAND_AVATAR,
    flags: 32768, components: [testCard()], allowed_mentions: { parse: [] }
  };
}
async function send(payload, test = false) {
  // wait=true bestaetigt, dass Discord die Nachricht wirklich gespeichert hat.
  // with_components=true ist auch bei normalen Webhooks fuer Link-Buttons noetig.
  const endpoint = validateWebhook(hook) + '?with_components=true&wait=true';
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('Discord antwortet mit HTTP ' + response.status);
  console.log(test ? 'Discord-Verbindungstest zugestellt.' : 'Versionsmeldung an Discord zugestellt.');
}
async function main() {
  if (!/^[-\w]+\/[-.\w]+$/.test(repo)) throw new Error('Ungueltiger Repositoryname');
  if (eventName === 'workflow_dispatch') return send(testPayload(), true);
  if (eventName !== 'push') {
    console.log('Kein Push-Ereignis; Benachrichtigung uebersprungen.');
    return;
  }
  const items = updatedScripts();
  if (!items.length) {
    console.log('Keine neuen @version-Werte erkannt, keine Discord-Nachricht.');
    return;
  }
  console.log('Neue Versionen erkannt: ' + items.map(x => x.file + ' ' + x.version).join(', '));
  await send(releasePayload(items));
}

// Offline-Tests importieren diese Bausteine, ohne Webhook-Nachrichten auszulösen.
export { getMetadata, parseReleaseNotes, cardFor, releasePayload, testPayload, validateWebhook };
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('Benachrichtigung fehlgeschlagen: ' + error.message); process.exitCode = 1; });
}
