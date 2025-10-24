let timeout;
const tabAccessTimes = {};

function updateAccessTime(tabId) {
  tabAccessTimes[tabId] = Date.now();
  chrome.storage.local.set({ tabAccessTimes });
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
      });
    });
  });

  // Schedule the next check
  timeout = setTimeout(checkTabs, 60 * 1000); // Check every minute
}

// Start the checker when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['tabAccessTimes'], (result) => {
    Object.assign(tabAccessTimes, result.tabAccessTimes || {});
    checkTabs();
  });
});

// Start the checker when Chrome starts
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['tabAccessTimes'], (result) => {
    Object.assign(tabAccessTimes, result.tabAccessTimes || {});
    checkTabs();
  });
});

// Listen for messages from the popup to trigger manual tab closing
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'closeTabsNow') {
    console.info('Manual tab closing triggered from popup.');
    clearTimeout(timeout); // Stop the current timeout to avoid double-checking
    checkTabs();
  }
});

// Stop the checker when the extension is uninstalled
chrome.runtime.onSuspend.addListener(() => {
  clearTimeout(timeout);
});
