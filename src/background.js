import { classifyTab } from './lib/terminate.js';

const CHECK_ALARM = 'checkTabs';

// MV3 service workers are killed after ~30s of inactivity, so access times must
// always be read-modify-written against storage: an in-memory cache would be
// lost on every worker restart and wipe out the other tabs' timestamps.
function updateAccessTime(tabId) {
  chrome.storage.local.get(['tabAccessTimes'], (result) => {
    const accessTimes = result.tabAccessTimes || {};
    accessTimes[tabId] = Date.now();
    chrome.storage.local.set({ tabAccessTimes: accessTimes });
  });
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  updateAccessTime(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    updateAccessTime(tabId);
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    chrome.tabs.query({ active: true, windowId }, (tabs) => {
      if (tabs.length > 0) {
        updateAccessTime(tabs[0].id);
      }
    });
  }
});

function checkTabs() {
  console.info('Running checkTabs...');
  chrome.storage.sync.get(['minutes', 'whitelist'], (result) => {
    const minutes = result.minutes || 60;
    const whitelist = result.whitelist || [];
    const now = Date.now();

    chrome.storage.local.get(['tabAccessTimes'], (storedAccessTimes) => {
      const accessTimes = storedAccessTimes.tabAccessTimes || {};
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          const decision = classifyTab(tab, {
            accessTime: accessTimes[tab.id],
            now,
            minutes,
            whitelist,
          });

          if (decision.urlError) {
            console.error(`Error parsing URL for tab ${tab.id} - ${tab.title}: ${decision.urlError}`);
          }

          if (decision.action === 'close') {
            console.info(`Closing tab ${tab.id} - ${tab.title}. Age: ${decision.ageMinutes} minutes.`);
            chrome.tabs.remove(tab.id);
            return;
          }

          switch (decision.reason) {
            case 'pinned':
              console.info(`Tab ${tab.id} - ${tab.title} is pinned. Skipping.`);
              break;
            case 'grouped':
              console.info(`Tab ${tab.id} - ${tab.title} is in group ${tab.groupId}. Skipping.`);
              break;
            case 'untracked':
              console.warn(`Tab ${tab.id} - ${tab.title} has no lastAccessed time recorded. Skipping.`);
              break;
            case 'whitelisted':
              console.info(`Tab ${tab.id} - ${tab.title} (${decision.domain}) is whitelisted. Age: ${decision.ageMinutes} minutes.`);
              break;
            default: // 'active'
              if (decision.minutesUntilClose <= 5) {
                console.warn(`Tab ${tab.id} - ${tab.title} will close in ${decision.minutesUntilClose} minutes. Age: ${decision.ageMinutes} minutes.`);
              } else {
                console.info(`Tab ${tab.id} - ${tab.title}. Age: ${decision.ageMinutes} minutes. Closes in ${decision.minutesUntilClose} minutes.`);
              }
          }
        });

        // Drop access times for tabs that no longer exist so storage doesn't
        // accumulate stale entries forever.
        const openTabIds = new Set(tabs.map((tab) => tab.id));
        const staleIds = Object.keys(accessTimes)
          .map(Number)
          .filter((id) => !openTabIds.has(id));
        if (staleIds.length > 0) {
          staleIds.forEach((id) => delete accessTimes[id]);
          chrome.storage.local.set({ tabAccessTimes: accessTimes });
          console.info(`Removed ${staleIds.length} stale access time entries.`);
        }
      });
    });
  });
}

// The alarm persists across service worker restarts, so it wakes the worker to
// run each check instead of relying on a setTimeout that dies with the worker.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CHECK_ALARM) {
    checkTabs();
  }
});

function startChecker() {
  chrome.alarms.create(CHECK_ALARM, { periodInMinutes: 1 });
  checkTabs();
}

// Start the checker when the extension is installed or updated
chrome.runtime.onInstalled.addListener(startChecker);

// Start the checker when Chrome starts
chrome.runtime.onStartup.addListener(startChecker);

// Listen for messages from the popup to trigger manual tab closing
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'closeTabsNow') {
    console.info('Manual tab closing triggered from popup.');
    checkTabs();
  }
});
