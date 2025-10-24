document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('settings-form');
  const minutesInput = document.getElementById('minutes');
  const whitelistEl = document.getElementById('whitelist');
  const addToWhitelistBtn = document.getElementById('add-to-whitelist');
  const closeTabsNowBtn = document.getElementById('close-tabs-now');

  let whitelist = [];

  // Load saved settings
  chrome.storage.sync.get(['minutes', 'whitelist'], (result) => {
    if (result.minutes) {
      minutesInput.value = result.minutes;
    }
    if (result.whitelist) {
      whitelist = result.whitelist;
      renderWhitelist();
    }
  });

  function renderWhitelist() {
    whitelistEl.innerHTML = '';
    whitelist.forEach((domain) => {
      const li = document.createElement('li');
      li.textContent = domain;
      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'x';
      removeBtn.addEventListener('click', () => {
        whitelist = whitelist.filter((d) => d !== domain);
        chrome.storage.sync.set({ whitelist });
        renderWhitelist();
      });
      li.appendChild(removeBtn);
      whitelistEl.appendChild(li);
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const minutes = parseInt(minutesInput.value, 10);
    if (minutes) {
      chrome.storage.sync.set({ minutes });
    }
  });

  addToWhitelistBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        const url = new URL(tabs[0].url);
        const domain = url.hostname;
        if (!whitelist.includes(domain)) {
          whitelist.push(domain);
          chrome.storage.sync.set({ whitelist });
          renderWhitelist();
        }
      }
    });
  });

  closeTabsNowBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'closeTabsNow' });
  });
});
