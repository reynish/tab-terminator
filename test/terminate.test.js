import { test } from 'tap';
import { classifyTab, extractDomain } from '../src/lib/terminate.js';

const MINUTE = 1000 * 60;

const baseTab = { id: 1, title: 'Test Tab' };

function tabWith(overrides) {
  return { ...baseTab, ...overrides };
}

// `minutesAgo` is how long ago the tab was last accessed; "never" is passed
// as undefined (the real case for tabs the extension hasn't seen yet).
function classify(tab, minutesAgo, { minutes = 60, whitelist = [] } = {}) {
  const now = 1_000_000 * MINUTE;
  const accessTime = minutesAgo === undefined ? undefined : now - (minutesAgo * MINUTE);
  return classifyTab(tab, { accessTime, now, minutes, whitelist });
}

// --- extractDomain ---

test('extractDomain returns the hostname of a valid URL', (t) => {
  t.equal(extractDomain('https://example.com/some/page'), 'example.com');
  t.equal(extractDomain('https://sub.example.com:8443/path?q=1'), 'sub.example.com');
  t.end();
});

test('extractDomain returns null for missing or unparseable URLs', (t) => {
  t.equal(extractDomain(undefined), null);
  t.equal(extractDomain(''), null);
  t.equal(extractDomain('not a url'), null);
  t.end();
});

// --- classifyTab: skip rules ---

test('pinned tabs are always skipped', (t) => {
  const decision = classify(tabWith({ pinned: true, url: 'https://old.example.com' }), 120);
  t.equal(decision.action, 'skip');
  t.equal(decision.reason, 'pinned');
  t.end();
});

test('grouped tabs are skipped', (t) => {
  const decision = classify(tabWith({ groupId: 5, url: 'https://old.example.com' }), 120);
  t.equal(decision.action, 'skip');
  t.equal(decision.reason, 'grouped');
  t.end();
});

test('ungrouped tabs are not treated as grouped (groupId -1)', (t) => {
  const decision = classify(tabWith({ groupId: -1, url: 'https://example.com' }), 120);
  t.equal(decision.action, 'close');
  t.end();
});

test('tabs with no recorded access time are skipped', (t) => {
  const decision = classify(tabWith({ url: 'https://example.com' }), undefined);
  t.equal(decision.action, 'skip');
  t.equal(decision.reason, 'untracked');
  t.end();
});

// --- classifyTab: whitelist ---

test('whitelisted domains are skipped regardless of age', (t) => {
  const decision = classify(
    tabWith({ url: 'https://example.com/page' }),
    120,
    { whitelist: ['example.com'] },
  );
  t.equal(decision.action, 'skip');
  t.equal(decision.reason, 'whitelisted');
  t.equal(decision.domain, 'example.com');
  t.end();
});

test('whitelist matches the exact hostname only', (t) => {
  const decision = classify(
    tabWith({ url: 'https://mail.example.com' }),
    120,
    { whitelist: ['example.com'] },
  );
  t.equal(decision.action, 'close');
  t.end();
});

// --- classifyTab: expiry ---

test('tabs older than the threshold are closed', (t) => {
  const decision = classify(tabWith({ url: 'https://example.com' }), 120, { minutes: 60 });
  t.equal(decision.action, 'close');
  t.equal(decision.reason, 'expired');
  t.equal(decision.ageMinutes, 120);
  t.end();
});

test('tabs inside the threshold are kept with time remaining', (t) => {
  const decision = classify(tabWith({ url: 'https://example.com' }), 30, { minutes: 60 });
  t.equal(decision.action, 'keep');
  t.equal(decision.reason, 'active');
  t.equal(decision.ageMinutes, 30);
  t.equal(decision.minutesUntilClose, 30);
  t.end();
});

test('boundary: a tab exactly at the threshold is kept (uses strict less-than)', (t) => {
  const decision = classify(tabWith({ url: 'https://example.com' }), 60, { minutes: 60 });
  t.equal(decision.action, 'keep');
  t.end();
});

// --- classifyTab: unparseable URLs ---

test('unparseable URLs are flagged but the tab is still age-checked', (t) => {
  const decision = classify(tabWith({ url: 'not a url' }), 120);
  t.ok(decision.urlError);
  t.equal(decision.action, 'close');
  t.notOk(decision.domain);
  t.end();
});