#!/usr/bin/env node
/*
 * BRUHN MEDIA | Discord Release Notifications
 * Runs without external packages. Never print the webhook URL or token.
 * Push: announce ONLY new @version values in root *.user.js files.
 * workflow_dispatch: send a clearly labelled TEST message.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

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
function recentChanges(file) {
  try {
    const range = isExistingCommit(before) ? before + '..' + after : after;
    const titles = git(['log', '-5', '--format=%s', range, '--', file])
      .split('\n').filter(Boolean).slice(0, 3);
    return titles.length ? titles.map(title => '• ' + safeSummary(title, 160)).join('\n')
      : 'Weitere Details im Commit-Verlauf';
  } catch {
    return 'Weitere Details im Commit-Verlauf';
  }
}
function embedFor(item) {
  const raw = 'https://raw.githubusercontent.com/' + repo + '/main/' + encodeURIComponent(item.file);
  const changes = 'https://github.com/' + repo + '/commits/main/' + encodeURIComponent(item.file);
  const description = 'Eine neue Version ist jetzt verfügbar.\n\n' +
    '**Version:** ' + safeSummary(item.version, 48) + '\n' +
    '**Vorher:** ' + safeSummary(item.oldVersion || 'Erstveröffentlichung', 48) + '\n' +
    '**Änderungen (Commit-Titel):**\n' + recentChanges(item.file);
  return {
    title: '🚀 ' + safeSummary(item.name, 190),
    description,
    url: changes,
    color: 0xD93030,
    fields: [
      { name: '📥 Download / Tampermonkey', value: '[Userscript installieren](' + raw + ')', inline: true },
      { name: '📝 Änderungsverlauf', value: '[Änderungen ansehen](' + changes + ')', inline: true },
    ],
    footer: { text: 'BRUHN MEDIA · Automatische GitHub-Versionsmeldung' },
  };
}
async function send(embeds, test = false) {
  const endpoint = validateWebhook(hook);
  const payload = {
    username: 'BRUHN MEDIA · GitHub Updates',
    content: test ? '🧪 **TEST** · GitHub → Discord ist verbunden.' :
      '🚀 **BRUHN MEDIA** · Neue Userscript-Version veröffentlicht!',
    embeds,
    allowed_mentions: { parse: [] },
  };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Discord antwortet mit HTTP ' + response.status);
  console.log(test ? 'Discord-Testnachricht zugestellt.' : 'Versionsmeldung an Discord zugestellt.');
}
async function main() {
  if (!/^[-\w]+\/[-.\w]+$/.test(repo)) throw new Error('Ungueltiger Repositoryname');
  if (eventName === 'workflow_dispatch') {
    return send([{ title: '✅ BRUHN MEDIA · Verbindungstest', color: 0x2EA043,
      description: 'Die automatische GitHub-Updatebenachrichtigung ist eingerichtet. ' +
        'Dies ist **kein** neues Release.' }], true);
  }
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
  await send(items.slice(0, 10).map(embedFor));
}
main().catch(error => { console.error('Benachrichtigung fehlgeschlagen: ' + error.message); process.exitCode = 1; });
