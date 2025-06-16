// Store recent hidden elements by website
let hiddenElementsByWebsite = {};
let currentPageElements = [];
let autocompleteTimeout = null;

document.addEventListener('DOMContentLoaded', function() {
  const hideButton = document.getElementById('hideButton');
  const selectorInput = document.getElementById('selector');
  const recentElementsContainer = document.getElementById('recentElements');
  const autocompleteDropdown = document.getElementById('autocompleteDropdown');

  // Load recent elements from storage
  chrome.storage.local.get(['hiddenElementsByWebsite'], function(result) {
    if (result.hiddenElementsByWebsite) {
      hiddenElementsByWebsite = result.hiddenElementsByWebsite;
      updateRecentElementsList();
    }
  });

  // Load current page elements
  loadCurrentPageElements();

  // Add input event listener for autocomplete
  selectorInput.addEventListener('input', function() {
    const value = this.value.trim();
    
    // Clear any existing timeout
    if (autocompleteTimeout) {
      clearTimeout(autocompleteTimeout);
    }

    // Hide dropdown if input is too short
    if (value.length > 3) {
      autocompleteDropdown.classList.remove('visible');
      return;
    }

    // Add a small delay to prevent too many updates
    autocompleteTimeout = setTimeout(() => {
      updateAutocomplete(value);
    }, 150);
  });

  // Handle clicks outside the autocomplete dropdown
  document.addEventListener('click', function(event) {
    if (!event.target.closest('.input-container')) {
      autocompleteDropdown.classList.remove('visible');
    }
  });

  // Handle keyboard navigation
  selectorInput.addEventListener('keydown', function(event) {
    const visibleItems = autocompleteDropdown.querySelectorAll('.autocomplete-item');
    const selectedItem = autocompleteDropdown.querySelector('.autocomplete-item.selected');
    
    switch(event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (selectedItem) {
          const nextItem = selectedItem.nextElementSibling;
          if (nextItem) {
            selectedItem.classList.remove('selected');
            nextItem.classList.add('selected');
            nextItem.scrollIntoView({ block: 'nearest' });
          }
        } else if (visibleItems.length > 0) {
          visibleItems[0].classList.add('selected');
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (selectedItem) {
          const prevItem = selectedItem.previousElementSibling;
          if (prevItem) {
            selectedItem.classList.remove('selected');
            prevItem.classList.add('selected');
            prevItem.scrollIntoView({ block: 'nearest' });
          }
        }
        break;
      case 'Enter':
        if (selectedItem) {
          event.preventDefault();
          selectorInput.value = selectedItem.dataset.selector;
          autocompleteDropdown.classList.remove('visible');
        }
        break;
      case 'Escape':
        autocompleteDropdown.classList.remove('visible');
        break;
    }
  });

  // Add event delegation for undo buttons, toggle buttons, and collapsible headers
  recentElementsContainer.addEventListener('click', async (event) => {
    if (event.target.classList.contains('undo-button')) {
      const website = event.target.dataset.website;
      const index = parseInt(event.target.dataset.index);
      await undoHide(website, index);
    } else if (event.target.classList.contains('toggle-button')) {
      const website = event.target.dataset.website;
      const index = parseInt(event.target.dataset.index);
      await toggleElement(website, index);
    } else if (event.target.closest('.website-header')) {
      const header = event.target.closest('.website-header');
      const content = header.nextElementSibling;
      const icon = header.querySelector('.toggle-icon');
      
      content.classList.toggle('expanded');
      icon.classList.toggle('expanded');
    }
  });

  // Add event delegation for autocomplete items
  autocompleteDropdown.addEventListener('click', function(event) {
    const item = event.target.closest('.autocomplete-item');
    if (item) {
      selectorInput.value = item.dataset.selector;
      autocompleteDropdown.classList.remove('visible');
    }
  });

  hideButton.addEventListener('click', async () => {
    const selector = selectorInput.value.trim();
    
    if (!selector) {
      alert('Please enter a CSS selector');
      return;
    }

    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);
    const website = url.hostname;

    // Execute the script to hide elements
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: hideElements,
      args: [selector]
    });

    const count = results[0].result;
    if (count > 0) {
      // Initialize website array if it doesn't exist
      if (!hiddenElementsByWebsite[website]) {
        hiddenElementsByWebsite[website] = [];
      }

      // Add to recent elements
      hiddenElementsByWebsite[website].unshift({
        selector: selector,
        timestamp: Date.now(),
        count: count,
        url: tab.url
      });

      // Keep only the last 10 items per website
      if (hiddenElementsByWebsite[website].length > 10) {
        hiddenElementsByWebsite[website].pop();
      }

      // Save to storage
      chrome.storage.local.set({ hiddenElementsByWebsite: hiddenElementsByWebsite });

      // Update the list
      updateRecentElementsList();
      
      // Clear the input
      selectorInput.value = '';
      autocompleteDropdown.classList.remove('visible');
    }
  });
});

async function loadCurrentPageElements() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: getPageElements
  });

  currentPageElements = results[0].result;
}

function updateAutocomplete(value) {
  const dropdown = document.getElementById('autocompleteDropdown');
  const matches = findMatchingElements(value);
  
  if (matches.length === 0) {
    dropdown.classList.remove('visible');
    return;
  }

  dropdown.innerHTML = matches.map(item => `
    <div class="autocomplete-item" data-selector="${item.selector}">
      <span>${item.selector}</span>
      <div class="element-preview">${item.preview}</div>
      <span class="element-count">${item.count}</span>
    </div>
  `).join('');

  dropdown.classList.add('visible');
}

function findMatchingElements(value) {
  const matches = [];
  const valueLower = value.toLowerCase();

  // Check for class matches
  const classMatches = currentPageElements.classes.filter(cls => 
    cls.name.toLowerCase().includes(valueLower)
  ).map(cls => ({
    selector: `.${cls.name}`,
    count: cls.count,
    preview: cls.preview
  }));

  // Check for ID matches
  const idMatches = currentPageElements.ids.filter(id => 
    id.name.toLowerCase().includes(valueLower)
  ).map(id => ({
    selector: `#${id.name}`,
    count: id.count,
    preview: id.preview
  }));

  // Check for tag matches
  const tagMatches = currentPageElements.tags.filter(tag => 
    tag.name.toLowerCase().includes(valueLower)
  ).map(tag => ({
    selector: tag.name,
    count: tag.count,
    preview: tag.preview
  }));

  return [...classMatches, ...idMatches, ...tagMatches]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Limit to 10 suggestions
}

// This function will be injected into the page
function getPageElements() {
  const elements = {
    classes: [],
    ids: [],
    tags: []
  };

  // Get all elements
  const allElements = document.querySelectorAll('*');

  // Process each element
  allElements.forEach(element => {
    // Get classes
    element.classList.forEach(className => {
      const existing = elements.classes.find(c => c.name === className);
      if (existing) {
        existing.count++;
      } else {
        elements.classes.push({
          name: className,
          count: 1,
          preview: element.textContent.trim().slice(0, 30)
        });
      }
    });

    // Get ID
    if (element.id) {
      const existing = elements.ids.find(i => i.name === element.id);
      if (existing) {
        existing.count++;
      } else {
        elements.ids.push({
          name: element.id,
          count: 1,
          preview: element.textContent.trim().slice(0, 30)
        });
      }
    }

    // Get tag
    const tagName = element.tagName.toLowerCase();
    const existing = elements.tags.find(t => t.name === tagName);
    if (existing) {
      existing.count++;
    } else {
      elements.tags.push({
        name: tagName,
        count: 1,
        preview: element.textContent.trim().slice(0, 30)
      });
    }
  });

  return elements;
}

function updateRecentElementsList() {
  const recentElementsContainer = document.getElementById('recentElements');
  
  if (Object.keys(hiddenElementsByWebsite).length === 0) {
    recentElementsContainer.innerHTML = '<div class="no-recent">No elements hidden yet</div>';
    return;
  }

  // Sort websites by most recent activity
  const sortedWebsites = Object.entries(hiddenElementsByWebsite)
    .sort(([, a], [, b]) => {
      const aLatest = a[0]?.timestamp || 0;
      const bLatest = b[0]?.timestamp || 0;
      return bLatest - aLatest;
    });

  recentElementsContainer.innerHTML = sortedWebsites.map(([website, items]) => `
    <div class="website-group">
      <div class="website-header">
        <h3>${website}</h3>
        <span class="material-icons toggle-icon">expand_more</span>
      </div>
      <div class="website-content">
        ${items.map((item, index) => `
          <div class="recent-item">
            <span>${item.selector} (${item.count} elements)</span>
            <div class="button-group">
              <button class="toggle-button ${item.isHidden ? 'hidden' : ''}" 
                      data-website="${website}" 
                      data-index="${index}">
                ${item.isHidden ? 'Show' : 'Hide'}
              </button>
              <button class="undo-button" 
                      data-website="${website}" 
                      data-index="${index}">
                Remove
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

async function toggleElement(website, index) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentWebsite = new URL(tab.url).hostname;
  const item = hiddenElementsByWebsite[website][index];

  // Only allow toggling if we're on the same website
  if (currentWebsite === website) {
    const newState = !item.isHidden;
    
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: newState ? hideElements : showElements,
      args: [item.selector]
    });

    // Update the state
    item.isHidden = newState;
    
    // Save to storage
    chrome.storage.local.set({ hiddenElementsByWebsite: hiddenElementsByWebsite });

    // Update the list
    updateRecentElementsList();
  } else {
    alert('You can only toggle elements while on the same website');
  }
}

async function undoHide(website, index) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentWebsite = new URL(tab.url).hostname;
  const item = hiddenElementsByWebsite[website][index];

  // Only allow undoing if we're on the same website
  if (currentWebsite === website) {
    // Show the element before removing
    if (item.isHidden) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: showElements,
        args: [item.selector]
      });
    }

    // Remove from hidden elements
    hiddenElementsByWebsite[website].splice(index, 1);
    
    // Remove website entry if no more hidden elements
    if (hiddenElementsByWebsite[website].length === 0) {
      delete hiddenElementsByWebsite[website];
    }
    
    // Save to storage
    chrome.storage.local.set({ hiddenElementsByWebsite: hiddenElementsByWebsite });

    // Update the list
    updateRecentElementsList();
  } else {
    alert('You can only remove elements while on the same website');
  }
}

// This function will be injected into the page
function hideElements(selector) {
  const elements = document.querySelectorAll(selector);
  elements.forEach(element => {
    element.style.display = 'none';
  });
  
  return elements.length;
}

// This function will be injected into the page
function showElements(selector) {
  const elements = document.querySelectorAll(selector);
  elements.forEach(element => {
    element.style.display = '';
  });
} 