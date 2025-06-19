// Content script that runs on page load
(function() {
  'use strict';

  // Check if we're on a valid URL where Chrome APIs are available
  if (window.location.protocol === 'chrome:' || 
      window.location.protocol === 'chrome-extension:' ||
      window.location.protocol === 'moz-extension:' ||
      window.location.protocol === 'edge:' ||
      window.location.protocol === 'about:' ||
      window.location.protocol === 'file:') {
    return; // Don't run on restricted URLs
  }

  // Function to hide elements
  function hideElements(selector) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(element => {
      element.style.display = 'none';
    });
    return elements.length;
  }

  // Function to check and auto-hide elements
  async function checkAndAutoHide() {
    try {
      console.log('Auto-hide: Checking preferences...');
      
      // Get auto-hide preference
      const result = await chrome.storage.local.get(['autoHideEnabled', 'hiddenElementsByWebsite']);
      
      console.log('Auto-hide: Preferences loaded:', result);
      
      if (!result.autoHideEnabled) {
        console.log('Auto-hide: Disabled, skipping...');
        return; // Auto-hide is disabled
      }

      const currentWebsite = window.location.hostname;
      const hiddenElements = result.hiddenElementsByWebsite || {};
      
      console.log('Auto-hide: Current website:', currentWebsite);
      console.log('Auto-hide: Hidden elements for this site:', hiddenElements[currentWebsite]);
      
      if (!hiddenElements[currentWebsite]) {
        console.log('Auto-hide: No hidden elements for this website');
        return; // No hidden elements for this website
      }

      let hiddenCount = 0;
      // Hide all elements that were previously hidden for this website
      hiddenElements[currentWebsite].forEach(item => {
        if (item.isHidden !== false) { // Hide if not explicitly set to false
          const count = hideElements(item.selector);
          hiddenCount += count;
          console.log('Auto-hide: Hidden', count, 'elements with selector:', item.selector);
        }
      });

      console.log('Auto-hide: Total hidden elements:', hiddenCount, 'on', currentWebsite);
    } catch (error) {
      console.error('Auto-hide error:', error);
    }
  }

  // Run auto-hide when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(checkAndAutoHide, 500); // Small delay to ensure elements are loaded
    });
  } else {
    setTimeout(checkAndAutoHide, 500); // Small delay to ensure elements are loaded
  }

  // Also run on window load to catch any late-loading elements
  window.addEventListener('load', () => {
    setTimeout(checkAndAutoHide, 1000); // Longer delay for window load
  });

  // Also run on navigation (for SPAs)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      setTimeout(checkAndAutoHide, 100); // Small delay to ensure page is loaded
    }
  }).observe(document, { subtree: true, childList: true });

  // Monitor for new content being added to the page
  let autoHideObserver = null;
  
  function startContentMonitoring() {
    if (autoHideObserver) {
      autoHideObserver.disconnect();
    }
    
    autoHideObserver = new MutationObserver((mutations) => {
      let shouldCheck = false;
      
      // Check if any new nodes were added
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if any of the added nodes are elements (not just text nodes)
          for (let node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              shouldCheck = true;
              break;
            }
          }
        }
      });
      
      if (shouldCheck) {
        // Debounce the check to avoid running too frequently
        clearTimeout(window.autoHideTimeout);
        window.autoHideTimeout = setTimeout(() => {
          checkAndAutoHide();
        }, 300);
      }
    });
    
    // Start observing
    autoHideObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    console.log('Auto-hide: Content monitoring started');
  }
  
  function stopContentMonitoring() {
    if (autoHideObserver) {
      autoHideObserver.disconnect();
      autoHideObserver = null;
      console.log('Auto-hide: Content monitoring stopped');
    }
  }
  
  // Function to check auto-hide status and start/stop monitoring
  async function updateAutoHideStatus() {
    try {
      const result = await chrome.storage.local.get(['autoHideEnabled']);
      
      if (result.autoHideEnabled) {
        startContentMonitoring();
      } else {
        stopContentMonitoring();
      }
    } catch (error) {
      console.error('Auto-hide: Error updating status:', error);
    }
  }
  
  // Listen for storage changes to update monitoring status
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.autoHideEnabled) {
      console.log('Auto-hide: Toggle changed to:', changes.autoHideEnabled.newValue);
      updateAutoHideStatus();
    }
  });
  
  // Initialize monitoring status
  updateAutoHideStatus();
})(); 