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
  chrome.storage.sync.get(['minutes', 'whitelist'], (result) => {
    const minutes = result.minutes || 60;
    const whitelist = result.whitelist || [];
    const threshold = Date.now() - (minutes * 60 * 1000);

    chrome.storage.local.get(['tabAccessTimes'], (storedAccessTimes) => {
      const accessTimes = storedAccessTimes.tabAccessTimes || {};
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.url) {
            const url = new URL(tab.url);
            const domain = url.hostname;
            if (whitelist.includes(domain)) {
              return;
            }
          }

          const lastAccessed = accessTimes[tab.id] || tab.lastAccessed;
          if (lastAccessed < threshold) {
            chrome.tabs.remove(tab.id);
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

// Stop the checker when the extension is uninstalled
chrome.runtime.onSuspend.addListener(() => {
  clearTimeout(timeout);
});
