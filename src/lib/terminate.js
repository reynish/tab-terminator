// Pure decision logic for Tab Terminator, kept free of `chrome.*` calls so it
// can be unit tested directly.

// Returns the hostname of `url`, or null when `url` is missing or unparseable
// (e.g. chrome:// pages do not fail, but malformed values can).
export function extractDomain(url) {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname;
  } catch (e) {
    return null;
  }
}

// Decides what should happen to a tab on a checker run.
//
// `settings`:
//   accessTime  - last recorded access time for the tab (ms epoch), or undefined
//   now         - current time (ms epoch); passed in to keep the function pure
//   minutes     - configured age threshold in minutes
//   whitelist   - array of whitelisted hostnames
//
// Returns { action, reason, domain, urlError, ageMinutes, minutesUntilClose }:
//   action 'skip'  - leave the tab alone (reason: pinned | grouped | untracked | whitelisted)
//   action 'close' - the tab has outlived its threshold (reason: expired)
//   action 'keep'  - the tab is still inside the threshold (reason: active)
//   urlError       - set when tab.url exists but could not be parsed; the tab
//                    is still evaluated (matching the pre-refactor behavior)
export function classifyTab(tab, { accessTime, now, minutes, whitelist = [] }) {
  if (tab.pinned) {
    return { action: 'skip', reason: 'pinned' };
  }

  // tab.groupId is -1 when not grouped; ensure it's a number before comparing
  if (typeof tab.groupId === 'number' && tab.groupId !== -1) {
    return { action: 'skip', reason: 'grouped' };
  }

  if (!accessTime) {
    return { action: 'skip', reason: 'untracked' };
  }

  const decision = {};
  const ageMilliseconds = now - accessTime;
  decision.ageMinutes = Math.floor(ageMilliseconds / (1000 * 60));
  decision.minutesUntilClose = minutes - decision.ageMinutes;

  if (tab.url) {
    const domain = extractDomain(tab.url);
    if (domain === null) {
      decision.urlError = `Invalid URL: ${tab.url}`;
    } else {
      decision.domain = domain;
      if (whitelist.includes(domain)) {
        return { ...decision, action: 'skip', reason: 'whitelisted' };
      }
    }
  }

  const threshold = now - (minutes * 60 * 1000);
  if (accessTime < threshold) {
    return { ...decision, action: 'close', reason: 'expired' };
  }

  return { ...decision, action: 'keep', reason: 'active' };
}
