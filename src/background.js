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
    const threshold = Date.now() - (minutes * 60 * 1000);

    chrome.storage.local.get(['tabAccessTimes'], (storedAccessTimes) => {
      const accessTimes = storedAccessTimes.tabAccessTimes || {};
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          // Skip pinned tabs
          if (tab.pinned) {
            console.info(`Tab ${tab.id} - ${tab.title} is pinned. Skipping.`);
            return;
          }

          // Skip tabs that are in a tab group
          // tab.groupId is -1 when not grouped; ensure it's a number before comparing
          if (typeof tab.groupId === 'number' && tab.groupId !== -1) {
            console.info(`Tab ${tab.id} - ${tab.title} is in group ${tab.groupId}. Skipping.`);
            return;
          }

          const lastAccessed = accessTimes[tab.id];
          if (!lastAccessed) {
            console.warn(`Tab ${tab.id} - ${tab.title} has no lastAccessed time recorded. Skipping.`);
            return;
          }

          const ageMilliseconds = Date.now() - lastAccessed;
          const ageMinutes = Math.floor(ageMilliseconds / (1000 * 60));
          const minutesUntilClose = minutes - ageMinutes;

          if (tab.url) {
            try {
              const url = new URL(tab.url);
              const domain = url.hostname;
              if (whitelist.includes(domain)) {
                console.info(`Tab ${tab.id} - ${tab.title} (${domain}) is whitelisted. Age: ${ageMinutes} minutes.`);
                return;
              }
            } catch (e) {
              console.error(`Error parsing URL for tab ${tab.id} - ${tab.title}: ${e.message}`);
            }
          }

          if (lastAccessed < threshold) {
            console.info(`Closing tab ${tab.id} - ${tab.title}. Age: ${ageMinutes} minutes.`);
            chrome.tabs.remove(tab.id);
          } else if (minutesUntilClose <= 5) {
            console.warn(`Tab ${tab.id} - ${tab.title} will close in ${minutesUntilClose} minutes. Age: ${ageMinutes} minutes.`);
          } else {
            console.info(`Tab ${tab.id} - ${tab.title}. Age: ${ageMinutes} minutes. Closes in ${minutesUntilClose} minutes.`);
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
