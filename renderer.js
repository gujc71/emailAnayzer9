// Store current connection configuration
let currentConfig = null;
let isImportInProgress = false;

// DOM elements
const connectionForm = document.getElementById('connection-form');
const mailboxTree = document.getElementById('mailbox-tree');
const emailList = document.getElementById('email-list');
const emailViewer = document.getElementById('email-viewer');
const currentMailboxHeader = document.getElementById('current-mailbox');

// Progress modal functions
function showProgressModal() {
  const modal = document.getElementById('progress-modal');
  modal.style.display = 'flex';
  isImportInProgress = true;
  
  // Reset progress
  updateProgressModal({
    status: 'Preparing connection...',
    percentage: 0,
    current: 0,
    total: 0,
    currentMailbox: 'Preparing...'
  });
}

function hideProgressModal() {
  const modal = document.getElementById('progress-modal');
  modal.style.display = 'none';
  isImportInProgress = false;
}

function updateProgressModal(progress) {
  const progressBar = document.getElementById('progress-bar');
  const percentage = document.getElementById('progress-percentage');
  const status = document.getElementById('progress-status');
  const currentCount = document.getElementById('progress-current-count');
  const totalCount = document.getElementById('progress-total-count');
  const currentMailbox = document.getElementById('progress-current-mailbox');

  if (progress.percentage !== undefined) {
    progressBar.style.width = progress.percentage + '%';
    percentage.textContent = Math.round(progress.percentage) + '%';
  }

  if (progress.status) {
    status.textContent = progress.status;
    // Add a subtle animation when status changes
    status.style.opacity = '0.6';
    setTimeout(() => {
      status.style.opacity = '1';
    }, 100);
  }

  if (progress.current !== undefined) {
    currentCount.textContent = progress.current;
  }

  if (progress.total !== undefined) {
    totalCount.textContent = progress.total;
  }

  if (progress.currentMailbox) {
    currentMailbox.textContent = progress.currentMailbox;
    // Add a subtle animation when mailbox changes
    currentMailbox.style.opacity = '0.4';
    setTimeout(() => {
      currentMailbox.style.opacity = '0.7';
    }, 150);
  }

  // Hide progress elements when completed
  if (progress.completed) {
    status.textContent = 'Completed!';
    progressBar.style.background = 'linear-gradient(90deg, #4CAF50, #8BC34A)';
    
    // Show completion message
    setTimeout(() => {
      status.textContent = 'Window will close automatically...';
    }, 1000);
    
    // Auto close after 3 seconds
    setTimeout(() => {
      hideProgressModal();
    }, 3000);
  }
}

// Add this function to create a hierarchical structure from flat mailbox records
function buildMailboxTree(mailboxes) {
  const tree = {};
  
  // Sort by path length to ensure parents are processed before children
  mailboxes.sort((a, b) => a.path.length - b.path.length);
  
  mailboxes.forEach(mailbox => {
    const path = mailbox.path;
    const name = mailbox.name;
    const parentPath = mailbox.parent_path;
    const delimiter = mailbox.delimiter;
    const flags = mailbox.flags ? JSON.parse(mailbox.flags) : [];
    
    if (!parentPath) {
      // This is a root mailbox
      tree[name] = {
        delimiter: delimiter,
        attribs: flags,
        children: {}
      };
    } else {
      // This is a child mailbox, add it to its parent
      let parent = tree;
      const pathParts = parentPath.split(delimiter);
      
      // Navigate to the parent in the tree
      for (const part of pathParts) {
        parent = parent[part].children;
      }
      
      // Add this mailbox to its parent
      parent[name] = {
        delimiter: delimiter,
        attribs: flags,
        children: {}
      };
    }
  });
  
  return tree;
}

// Add event listeners for the two buttons
document.getElementById('connect-only-btn').addEventListener('click', async () => {
  const config = getConnectionConfig();
  try {
    // Connect to IMAP server without importing emails
    const result = await window.api.connectImapOnly(config);
    if (result.error) {
      throw new Error(result.error);
    }
    alert('Successfully connected to the IMAP server.');
    // Save config for later use
    currentConfig = config;
    
    // Hide the modal
    document.getElementById('connection-modal').style.display = 'none';
    
    // Load mailboxes from database
    await loadMailboxes();
  } catch (error) {
    alert(`Connection error: ${error.message}`);
  }
});

document.getElementById('connect-init-btn').addEventListener('click', async () => {
  const config = getConnectionConfig();
  const button = document.getElementById('connect-init-btn');
  const originalText = button.textContent;
  
  try {
    // Disable button and show loading state
    button.disabled = true;
    button.textContent = 'Connecting...';
    
    // Show progress modal
    showProgressModal();
    
    // Connect to IMAP server, clear database, and fetch all emails
    const result = await window.api.connectImapAndInit(config);
    
    if (result.error) {
      hideProgressModal();
      throw new Error(result.error);
    }
    
    // Save config for later use
    currentConfig = config;
    
    // Hide the connection modal
    document.getElementById('connection-modal').style.display = 'none';
    
    // Load mailboxes from database
    await loadMailboxes();
    
  } catch (error) {
    hideProgressModal();
    alert(`Connection error: ${error.message}`);
  } finally {
    // Restore button state
    button.disabled = false;
    button.textContent = originalText;
  }
});

// Helper function to get connection config from form
function getConnectionConfig() {
  return {
    host: document.getElementById('host').value,
    port: parseInt(document.getElementById('port').value),
    user: document.getElementById('user').value,
    password: document.getElementById('password').value,
    tls: document.getElementById('tls').checked
  };
}

// Add a new function to load mailboxes from database
async function loadMailboxes() {
  try {
    const mailboxesFromDb = await window.api.getMailboxes();
    
    if (Array.isArray(mailboxesFromDb) && mailboxesFromDb.length > 0) {
      const mailboxesTree = buildMailboxTree(mailboxesFromDb);
      displayMailboxes(mailboxesTree);
    } else {
      console.log('No mailboxes found in database');
      mailboxTree.innerHTML = '<li>No mailboxes found</li>';
      
      // Show the connection modal if no mailboxes found
      document.getElementById('connection-modal').style.display = 'block';
    }
  } catch (error) {
    console.error('Error loading mailboxes:', error);
    mailboxTree.innerHTML = '<li>Error loading mailboxes</li>';
    
    // Also show connection modal on error loading mailboxes
    document.getElementById('connection-modal').style.display = 'block';
  }
}

// Hide login form on successful connection
window.api.onHideLoginForm(() => {
  document.getElementById('connection-modal').style.display = 'none';
});

// Display mailboxes in a tree structure
function displayMailboxes(mailboxes, parentElement = mailboxTree, path = '') {
  // Clear the parent element if it's the root
  if (parentElement === mailboxTree) {
    parentElement.innerHTML = '';
  }
  
  // Create list items for each mailbox
  for (const [name, box] of Object.entries(mailboxes)) {
    const li = document.createElement('li');
    const fullPath = path ? `${path}${box.delimiter || '/'}${name}` : name;
    
    // Create item with name
    const itemSpan = document.createElement('span');
    itemSpan.textContent = name;
    itemSpan.classList.add('mailbox-item');
    itemSpan.dataset.path = fullPath;
    li.appendChild(itemSpan);
    
    // If it has children, create a nested list
    if (box.children && Object.keys(box.children).length > 0) {
      const ul = document.createElement('ul');
      li.appendChild(ul);
      displayMailboxes(box.children, ul, fullPath);
    }
    
    parentElement.appendChild(li);
  }
}

// Event delegation for mailbox tree
mailboxTree.addEventListener('click', (e) => {
  const mailboxItem = e.target.closest('.mailbox-item');
  if (mailboxItem) {
    loadEmails(mailboxItem.dataset.path);
  }
});

// Load emails from a mailbox
async function loadEmails(mailboxPath) {
  try {
    currentMailboxHeader.textContent = mailboxPath;
    
    // Fetch emails from the database instead of IMAP
    const emails = await window.api.getEmailsByMailbox(mailboxPath);
    
    if (emails.error) {
      throw new Error(emails.error);
    }
    
    // Display email list
    displayEmailList(emails);
  } catch (error) {
    alert(`Error loading emails: ${error.message}`);
    console.error('Error in loadEmails:', error);
  }
}

// Display the list of emails
function displayEmailList(emails) {
  emailList.innerHTML = '';
  
  // Sort emails by date (newest first)
  emails.sort((a, b) => {
    const dateA = new Date(a.headers.date[0]);
    const dateB = new Date(b.headers.date[0]);
    return dateB - dateA;
  });
  
  // Create email list items
  emails.forEach(email => {
    const emailDiv = document.createElement('div');
    emailDiv.classList.add('email-item');
    emailDiv.dataset.emailId = email.id;
    
    // Format date
    const date = new Date(email.headers.date[0]);
    const formattedDate = date.toLocaleString();
    
    // Set email details
    emailDiv.innerHTML = `
      <div class="email-header">
        <div class="email-subject">${email.headers.subject ? email.headers.subject[0] : 'No Subject'}</div>
        <div class="email-date">${formattedDate}</div>
      </div>
      <div class="email-from">${email.headers.from ? email.headers.from[0] : 'Unknown Sender'}</div>
    `;
    
    emailList.appendChild(emailDiv);
  });
}

// Event delegation for email list
emailList.addEventListener('click', (e) => {
  const emailItem = e.target.closest('.email-item');
  if (emailItem) {
    document.querySelectorAll('.email-item').forEach(item => {
      item.classList.remove('selected');
    });
    emailItem.classList.add('selected');
    loadEmailContent(emailItem.dataset.emailId, currentMailboxHeader.textContent);
  }
});

// Load email content
async function loadEmailContent(id, mailboxPath) {
  if (!currentConfig) {
    alert('Please connect to an mail server first.');
    return;
  }
  
  try {
    // Fetch email content
    const content = await window.api.getEmailContent({
      config: currentConfig,
      mailbox: mailboxPath,
      id: id
    });
    
    // Display email content
    displayEmailContent(content);
  } catch (error) {
    alert(`Error loading email content: ${error.message}`);
  }
}

// Display email content
function displayEmailContent(email) {
  // Create email view
  let contentHtml = `
    <div class="email-content-header">
      <h2>${email.subject || 'No Subject'}</h2>
      <div class="email-details">
        <div><strong>From:</strong> ${email.from ? email.from.text : 'Unknown Sender'}</div>
        <div><strong>To:</strong> ${email.to ? email.to.text : 'Unknown Recipient'}</div>
        <div><strong>Date:</strong> ${email.date ? email.date.toLocaleString() : 'Unknown Date'}</div>
      </div>
    </div>
    <div class="email-body">
  `;
  
  // Add email body (prefer HTML if available)
  if (email.html) {
    contentHtml += `<iframe srcdoc="${email.html.replace(/"/g, '&quot;')}" width="100%" height="400" frameborder="0"></iframe>`;
  } else {
    contentHtml += `<pre>${email.text || 'No content'}</pre>`;
  }
  
  contentHtml += `</div>`;
  
  // Display attachments if any
  if (email.attachments && email.attachments.length > 0) {
    contentHtml += `<div class="attachments">
      <h3>Attachments</h3>
      <ul>
        ${email.attachments.map(att => `<li>${att.filename} (${formatFileSize(att.size)})</li>`).join('')}
      </ul>
    </div>`;
  }
  
  emailViewer.innerHTML = contentHtml;
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' bytes';
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  else return (bytes / 1048576).toFixed(1) + ' MB';
}

// Helper function to get week number of month
function getWeekOfMonth(date) {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstWeekday = firstDay.getDay();
  const offsetDate = date.getDate() + firstWeekday - 1;
  return Math.floor(offsetDate / 7) + 1;
}

// Updated groupDataByWeek function to work with both sender and recipient data
function groupDataByWeek(rows, accountField) {
  // Map<weekKey, Map<account, count>>
  return rows.reduce((weeklyData, row) => {
    const date = new Date(row.date);
    const month = date.getMonth() + 1;
    const weekNum = getWeekOfMonth(date);
    const weekKey = `${month.toString().padStart(2, '0')}/w${weekNum}`;

    if (!weeklyData.has(weekKey)) {
      weeklyData.set(weekKey, new Map());
    }

    const accountMap = weeklyData.get(weekKey);
    accountMap.set(row[accountField], (accountMap.get(row[accountField]) || 0) + row.count);

    return weeklyData;
  }, new Map());
}

// Rename the existing loadAnalysis function to loadSenderAnalysis
async function loadSenderAnalysis(start, end) {
  const analysisViewer = document.getElementById('analysis-viewer');
  analysisViewer.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <div class="loading-text">Analyzing senders...</div>
    </div>
  `;

  try {
    const viewType = document.querySelector('input[name="view-type"]:checked').value;
    
    const rows = await window.api.getEmailsGroupByFrom({
      startDate: start,
      endDate: end
    });

    if (rows.error) {
      analysisViewer.innerHTML = `<p class="error-message">Error: ${rows.error}</p>`;
      return;
    }

    if (rows.length === 0) {
      analysisViewer.innerHTML = '<p class="empty-message">No emails found in the selected date range.</p>';
      return;
    }

    displayAnalysisResults(rows, 'from_account', 'from_name', 'Sender / Date', analysisViewer, viewType);
  } catch (error) {
    console.error('Error fetching sender analysis:', error.message);
    analysisViewer.innerHTML = `<p class="error-message">Error: ${error.message}</p>`;
  }
}

// Add new function for recipient analysis
async function loadRecipientAnalysis(start, end) {
  const analysisViewer = document.getElementById('analysis-viewer');
  analysisViewer.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <div class="loading-text">Analyzing recipients...</div>
    </div>
  `;

  try {
    const viewType = document.querySelector('input[name="view-type"]:checked').value;
    
    const rows = await window.api.getEmailsGroupByRecipient({
      startDate: start,
      endDate: end
    });

    if (rows.error) {
      analysisViewer.innerHTML = `<p class="error-message">Error: ${rows.error}</p>`;
      return;
    }

    if (rows.length === 0) {
      analysisViewer.innerHTML = '<p class="empty-message">No recipient data found in the selected date range.</p>';
      return;
    }

    displayAnalysisResults(rows, 'recipient_account', 'recipient_name', 'Recipient / Date', analysisViewer, viewType);
  } catch (error) {
    console.error('Error fetching recipient analysis:', error.message);
    analysisViewer.innerHTML = `<p class="error-message">Error: ${error.message}</p>`;
  }
}

// Add new function for keywords analysis
async function loadKeywordsAnalysis(start, end) {
  const analysisViewer = document.getElementById('analysis-viewer');
  analysisViewer.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <div class="loading-text">Analyzing keywords...</div>
    </div>
  `;

  try {
    const viewType = document.querySelector('input[name="view-type"]:checked').value;
    
    const rows = await window.api.getEmailsGroupByKeywords({
      startDate: start,
      endDate: end
    });

    if (rows.error) {
      analysisViewer.innerHTML = `<p class="error-message">Error: ${rows.error}</p>`;
      return;
    }

    if (rows.length === 0) {
      analysisViewer.innerHTML = '<p class="empty-message">No keywords found in the selected date range.</p>';
      return;
    }

    displayAnalysisResults(rows, 'keyword', 'keyword', 'Keywords / Date', analysisViewer, viewType);
  } catch (error) {
    console.error('Error fetching keywords analysis:', error.message);
    analysisViewer.innerHTML = `<p class="error-message">Error: ${error.message}</p>`;
  }
}

// Add a new function to handle reference analysis with date parameters
function loadReferenceAnalysis(start, end) {
  const analysisViewer = document.getElementById('analysis-viewer');
  analysisViewer.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <div class="loading-text">Loading email references...</div>
    </div>
  `;

  try {
    // Fetch mail references data with the date range
    window.api.getMailReferences({
      startDate: start,
      endDate: end
    }).then(referenceData => {
      if (!referenceData || referenceData.error) {
        throw new Error(referenceData.error || 'Failed to load reference data');
      }
      
      if (referenceData.nodes.length === 0) {
        analysisViewer.innerHTML = '<p class="empty-message">No email references found in the selected date range.</p>';
        return;
      }
      
      // Create container for D3 graph
      analysisViewer.innerHTML = '<div id="reference-graph"></div>';
      
      // Load D3.js dynamically if not already loaded
      loadD3().then(() => {
        // Store data for resize handling
        currentReferenceData = referenceData;
        // Create and render the graph visualization
        createReferenceGraph(referenceData);
      });
    });
  } catch (error) {
    console.error('Error visualizing references:', error);
    analysisViewer.innerHTML = `<p class="error-message">Error: ${error.message}</p>`;
  }
}

// Common function to display analysis results
function displayAnalysisResults(rows, accountField, nameField, headerTitle, analysisViewer, viewType) {
  const uniqueAccounts = [];
  const accountMap = new Map();
  
  rows.forEach(row => {
    if (!accountMap.has(row[accountField])) {
      accountMap.set(row[accountField], {
        account: row[accountField],
        name: row[nameField]
      });
      uniqueAccounts.push(row[accountField]);
    }
  });

  let dateHeaders;
  let displayData;

  if (viewType === 'week') {
    const weeklyData = groupDataByWeek(rows, accountField);
    dateHeaders = [...weeklyData.keys()].sort();
    displayData = weeklyData;
  } else {
    dateHeaders = [...new Set(rows.map(row => row.date))].sort();
    displayData = new Map(dateHeaders.map(date => [
      date,
      new Map(rows.filter(row => row.date === date)
        .map(row => [row[accountField], row.count]))
    ]));
  }

  let tableHTML = '<table class="data-table"><thead><tr>';
  tableHTML += `<th>${headerTitle}</th>`;
  
  dateHeaders.forEach(date => {
    const displayDate = viewType === 'week' ? date : date.substring(5);
    tableHTML += `<th>${displayDate}</th>`;
  });
  
  tableHTML += '</tr></thead><tbody>';

  uniqueAccounts.forEach(account => {
    const accountInfo = accountMap.get(account);
    const displayName = accountInfo.name || accountInfo.account;

    tableHTML += '<tr>';
    tableHTML += `<td class="header-cell" title="${accountInfo.account}">${displayName}</td>`;

    dateHeaders.forEach(dateKey => {
      const dateData = displayData.get(dateKey);
      const count = dateData ? (dateData.get(account) || '') : '';
      const cellClass = count ? 'data-cell has-data clickable-cell' : 'data-cell';
      
      // Add data attributes for cell click handling
      const dataAttributes = count ? 
        `data-account="${account}" data-date="${dateKey}" data-count="${count}" data-analysis-type="${lastAnalysisType}"` : 
        '';
      
      tableHTML += `<td class="${cellClass}" ${dataAttributes}>${count}</td>`;
    });

    tableHTML += '</tr>';
  });

  tableHTML += '</tbody></table>';
  
  analysisViewer.innerHTML = tableHTML;

  // Add click event listeners to clickable cells
  const clickableCells = analysisViewer.querySelectorAll('.clickable-cell');
  clickableCells.forEach(cell => {
    cell.addEventListener('click', handleCellClick);
  });

  // Add table sorting feature
  const table = analysisViewer.querySelector('.data-table');
  const th = table.querySelector('th');
  let isAscending = true;

  th.style.cursor = 'pointer';
  th.addEventListener('click', () => {
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    // Sort
    rows.sort((a, b) => {
      const aValue = a.querySelector('.header-cell').textContent;
      const bValue = b.querySelector('.header-cell').textContent;
      
      if (isAscending) {
        return aValue.localeCompare(bValue);
      } else {
        return bValue.localeCompare(aValue);
      }
    });
    
    // Add sorted rows back to tbody
    rows.forEach(row => tbody.appendChild(row));
    
    // Toggle sort direction
    isAscending = !isAscending;
    
    // Update sort direction indicator
    th.textContent = `${headerTitle} ${isAscending ? '▼' : '▲'}`;
  });
}

// Handle cell click to show email list
async function handleCellClick(event) {
  const cell = event.target;
  const account = cell.dataset.account;
  const date = cell.dataset.date;
  const count = cell.dataset.count;
  const analysisType = cell.dataset.analysisType;
  
  if (!account || !date || !count) return;
  
  // Get modal elements
  const emailListModal = document.getElementById('email-list-modal');
  const emailListTitle = document.getElementById('email-list-title');
  const filteredEmailList = document.getElementById('filtered-email-list');
  
  // Show modal
  emailListModal.style.display = 'block';
  
  // Show loading
  emailListTitle.textContent = 'Loading emails...';
  filteredEmailList.innerHTML = '<div class="loading-spinner">Loading...</div>';
  
  try {
    let emails;
    let titleText;
    
    if (analysisType === 'sender') {
      emails = await window.api.getEmailsByFromAccount({ fromAccount: account, date });
      titleText = `Emails from ${account} on ${date} (${count} emails)`;
    } else if (analysisType === 'recipient') {
      emails = await window.api.getEmailsByRecipientAccount({ recipientAccount: account, date });
      titleText = `Emails to ${account} on ${date} (${count} emails)`;
    } else if (analysisType === 'keywords') {
      emails = await window.api.getEmailsByKeyword({ keyword: account, date });
      titleText = `Emails with keyword "${account}" on ${date} (${count} emails)`;
    }
    
    if (emails.error) {
      throw new Error(emails.error);
    }
    
    // Update title
    emailListTitle.textContent = titleText;
    
    // Display email list
    displayFilteredEmailList(emails);
    
  } catch (error) {
    console.error('Error fetching emails:', error);
    emailListTitle.textContent = 'Error loading emails';
    filteredEmailList.innerHTML = `<p class="error-message">Error: ${error.message}</p>`;
  }
}

// Display filtered email list
function displayFilteredEmailList(emails) {
  const filteredEmailList = document.getElementById('filtered-email-list');
  
  if (!emails || emails.length === 0) {
    filteredEmailList.innerHTML = '<p class="empty-message">No emails found.</p>';
    return;
  }
  
  filteredEmailList.innerHTML = '';
  
  // Sort emails by time (newest first)
  emails.sort((a, b) => {
    const timeA = a.time || '00:00:00';
    const timeB = b.time || '00:00:00';
    return timeB.localeCompare(timeA);
  });
  
  // Create email list items
  emails.forEach(email => {
    const emailDiv = document.createElement('div');
    emailDiv.classList.add('email-item');
    emailDiv.dataset.emailId = email.email_id;
    emailDiv.dataset.mailbox = email.mailbox;
    
    // Format date and time
    const dateTime = new Date(email.date + 'T' + email.time);
    const formattedDateTime = dateTime.toLocaleString();
    
    // Set email details
    emailDiv.innerHTML = `
      <div class="email-header">
        <div class="email-subject">${email.subject || 'No Subject'}</div>
        <div class="email-date">${formattedDateTime}</div>
      </div>
      <div class="email-from">${email.from_name ? `${email.from_name} <${email.from_account}>` : email.from_account}</div>
      <div class="email-to">${email.to_accounts ? `To: ${email.to_accounts}` : ''}</div>
    `;
    
    filteredEmailList.appendChild(emailDiv);
  });
  
  // Add click event listeners to email items
  const emailItems = filteredEmailList.querySelectorAll('.email-item');
  emailItems.forEach(item => {
    item.addEventListener('click', handleFilteredEmailClick);
  });
}

// Handle filtered email click to show content
async function handleFilteredEmailClick(event) {
  const emailItem = event.target.closest('.email-item');
  if (!emailItem) return;
  
  // Remove selection from other items
  document.querySelectorAll('#filtered-email-list .email-item').forEach(item => {
    item.classList.remove('selected');
  });
  emailItem.classList.add('selected');
  
  const emailId = emailItem.dataset.emailId;
  const mailbox = emailItem.dataset.mailbox;
  
  if (!currentConfig) {
    alert('Please connect to a mail server first.');
    return;
  }
  
  // Get modal elements
  const emailContentModal = document.getElementById('email-content-modal');
  const filteredEmailViewer = document.getElementById('filtered-email-viewer');
  
  // Show modal
  emailContentModal.style.display = 'block';
  filteredEmailViewer.innerHTML = '<div class="loading-spinner">Loading email content...</div>';
  
  try {
    // Fetch email content
    const content = await window.api.getEmailContent({
      config: currentConfig,
      mailbox: mailbox,
      id: emailId
    });
    
    // Display email content
    displayFilteredEmailContent(content);
  } catch (error) {
    console.error('Error loading email content:', error);
    filteredEmailViewer.innerHTML = `<p class="error-message">Error loading email content: ${error.message}</p>`;
  }
}

// Display filtered email content
function displayFilteredEmailContent(email) {
  const filteredEmailViewer = document.getElementById('filtered-email-viewer');
  
  // Create email view
  let contentHtml = `
    <div class="email-content-header">
      <h2>${email.subject || 'No Subject'}</h2>
      <div class="email-details">
        <div><strong>From:</strong> ${email.from ? email.from.text : 'Unknown Sender'}</div>
        <div><strong>To:</strong> ${email.to ? email.to.text : 'Unknown Recipient'}</div>
        <div><strong>Date:</strong> ${email.date ? email.date.toLocaleString() : 'Unknown Date'}</div>
      </div>
    </div>
    <div class="email-body">
  `;
  
  // Add email body (prefer HTML if available)
  if (email.html) {
    contentHtml += `<iframe srcdoc="${email.html.replace(/"/g, '&quot;')}" width="100%" height="400" frameborder="0"></iframe>`;
  } else {
    contentHtml += `<pre>${email.text || 'No content'}</pre>`;
  }
  
  contentHtml += `</div>`;
  
  // Display attachments if any
  if (email.attachments && email.attachments.length > 0) {
    contentHtml += `<div class="attachments">
      <h3>Attachments</h3>
      <ul>
        ${email.attachments.map(att => `<li>${att.filename} (${formatFileSize(att.size)})</li>`).join('')}
      </ul>
    </div>`;
  }
  
  filteredEmailViewer.innerHTML = contentHtml;
}

// Helper function to load D3.js dynamically
function loadD3() {
  return new Promise((resolve, reject) => {
    if (window.d3) {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://d3js.org/d3.v7.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load D3.js'));
    document.head.appendChild(script);
  });
}

// Create reference graph visualization using D3
function createReferenceGraph(data) {
  const container = document.getElementById('reference-graph');
  const width = container.clientWidth;
  const height = container.clientHeight;
  
  // Create tooltip div
  const tooltip = d3.select("body").append("div")
    .attr("class", "node-tooltip")
    .style("opacity", 0);
  
  // Create SVG container
  const svg = d3.select("#reference-graph")
    .append("svg")
    .attr("width", width)
    .attr("height", height);
  
  // Create zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });
  
  svg.call(zoom);
  
  // Create main group element that will be transformed
  const g = svg.append("g");
  
  // Create force simulation
  const simulation = d3.forceSimulation(data.nodes)
    .force("link", d3.forceLink(data.links).id(d => d.id).distance(150))
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius(80));
  
  // Add arrow marker definition
  svg.append("defs").append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 20)  // Position the arrow away from the target node
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#999");
  
  // Create links with arrows
  const link = g.append("g")
    .selectAll("line")
    .data(data.links)
    .enter()
    .append("line")
    .attr("class", "link")
    .attr("marker-end", "url(#arrow)"); // Add the arrow marker to the end of each link
  
  // Create nodes
  const node = g.append("g")
    .selectAll(".node")
    .data(data.nodes)
    .enter()
    .append("g")
    .attr("class", "node")
    .call(d3.drag()
      .on("start", dragStarted)
      .on("drag", dragged)
      .on("end", dragEnded));
  
  // Add circles to nodes
  node.append("circle")
    .attr("r", d => {
      // Size based on number of connections (larger for more connections)
      const connections = data.links.filter(link => 
        link.source === d.id || link.source.id === d.id || 
        link.target === d.id || link.target.id === d.id
      ).length;
      return Math.max(5, Math.min(15, 5 + connections * 1.5));
    });
  
  // Add text labels to nodes
  node.append("text")
    .attr("dx", 15)
    .attr("dy", ".35em")
    .text(d => {
      // Truncate subject for display
      const subject = d.subject || "No Info";
      return subject.length > 30 ? subject.substring(0, 27) + "..." : subject;
    });
  
  // Add tooltip behavior and highlight connected nodes/edges
  node.on("mouseover", function(event, d) {
      // Highlight connected nodes and edges
      node.style("opacity", n => {
        if (n === d) return 1;
        return isConnected(d, n) ? 1 : 0.3;
      });

      link.style("opacity", l => {
        return l.source.id === d.id || l.target.id === d.id ? 1 : 0.3;
      });

      // Show tooltip
      tooltip.transition()
        .duration(200)
        .style("opacity", 0.9)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
      if (d.date) {
        tooltip.html(`
          <strong>${d.subject || "No Info"}</strong><br/>
          From: ${d.from || "Unknown"}<br/>
          Date: ${new Date(d.date).toLocaleString() || "Unknown"}<br/>
          Message ID: ${d.id || "Unknown"}
        `);
      } else {
        tooltip.html(`
          <strong>No Info</strong><br/>
          Message ID: ${d.id || "Unknown"}
        `);        
      }
    })
    .on("mouseout", function() {
      // Reset opacity
      node.style("opacity", 1);
      link.style("opacity", 1);

      // Hide tooltip
      tooltip.transition()
        .duration(500)
        .style("opacity", 0);
    });
  
  // Helper function to check if two nodes are connected
  function isConnected(a, b) {
    return data.links.some(link => 
      (link.source.id === a.id && link.target.id === b.id) ||
      (link.source.id === b.id && link.target.id === a.id)
    );
  }
  
  // Update positions on each tick of the simulation
  simulation.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);
    
    node.attr("transform", d => `translate(${d.x},${d.y})`);
  });
  
  // Drag functions
  function dragStarted(event) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }
  
  function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }
  
  function dragEnded(event) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }
}

// Store reference data globally for resize handling
let currentReferenceData = null;

// Handle window resize for reference graph
function handleReferenceGraphResize() {
  if (currentReferenceData && document.getElementById('reference-graph')) {
    // Clear existing graph
    d3.select("#reference-graph").selectAll("*").remove();
    // Recreate with new dimensions
    createReferenceGraph(currentReferenceData);
  }
}

// Add resize event listener
window.addEventListener('resize', debounce(handleReferenceGraphResize, 250));

// Debounce function to limit resize events
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

  // Track the last selected analysis type
  let lastAnalysisType = 'sender';

document.addEventListener('DOMContentLoaded', () => {
  const startDate = document.getElementById('start-date');
  const endDate = document.getElementById('end-date');
  const applyDateRange = document.getElementById('apply-date-range');
  const importBtn = document.getElementById('connect-server-btn');
  const connectionModal = document.getElementById('connection-modal');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Set default dates (last 6 months)
  const today = new Date();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(today.getMonth() - 6);
  startDate.value = sixMonthsAgo.toISOString().split('T')[0];
  endDate.value = today.toISOString().split('T')[0];

  // Handle date range application
  applyDateRange.addEventListener('click', () => {
    const start = startDate.value;
    const end = endDate.value;
    
    if (!start || !end) {
      alert('Please select both start and end dates');
      return;
    }
    
    if (new Date(start) > new Date(end)) {
      alert('Start date cannot be later than end date');
      return;
    }
    
    // Use lastAnalysisType to determine which analysis to load
    if (lastAnalysisType === 'recipient') {
      loadRecipientAnalysis(start, end);
    } else if (lastAnalysisType === 'reference') {
      loadReferenceAnalysis(start, end);
    } else if (lastAnalysisType === 'keywords') {
      loadKeywordsAnalysis(start, end);
    } else {
      loadSenderAnalysis(start, end);
    }
  });

  // Sender menu click handler
  document.getElementById('sender-menu').addEventListener('click', (e) => {
    e.preventDefault();
    lastAnalysisType = 'sender';
    currentReferenceData = null; // Clear reference data
    loadSenderAnalysis(startDate.value, endDate.value);
  });

  // Recipient menu click handler
  document.getElementById('recipient-menu').addEventListener('click', (e) => {
    e.preventDefault();
    lastAnalysisType = 'recipient';
    currentReferenceData = null; // Clear reference data
    loadRecipientAnalysis(startDate.value, endDate.value);
  });

  // Reference visualization with D3
  document.getElementById('reference-menu').addEventListener('click', async (e) => {
    e.preventDefault();
    lastAnalysisType = 'reference';
    loadReferenceAnalysis(startDate.value, endDate.value);
  });

  // Keywords menu click handler
  document.getElementById('keywords-menu').addEventListener('click', (e) => {
    e.preventDefault();
    lastAnalysisType = 'keywords';
    currentReferenceData = null; // Clear reference data
    loadKeywordsAnalysis(startDate.value, endDate.value);
  });

  // Import button click event
  importBtn.addEventListener('click', () => {
    connectionModal.style.display = 'block';
  });

  // Close modal on outside click
  connectionModal.addEventListener('click', (e) => {
    if (e.target === connectionModal) {
      connectionModal.style.display = 'none';
    }
  });

  // Email list modal close functionality
  const emailListModal = document.getElementById('email-list-modal');
  const closeEmailListModal = document.getElementById('close-email-list-modal');
  
  closeEmailListModal.addEventListener('click', () => {
    emailListModal.style.display = 'none';
  });
  
  emailListModal.addEventListener('click', (e) => {
    if (e.target === emailListModal) {
      emailListModal.style.display = 'none';
    }
  });

  // Email content modal close functionality
  const emailContentModal = document.getElementById('email-content-modal');
  const closeEmailContentModal = document.getElementById('close-email-content-modal');
  
  closeEmailContentModal.addEventListener('click', () => {
    emailContentModal.style.display = 'none';
  });
  
  emailContentModal.addEventListener('click', (e) => {
    if (e.target === emailContentModal) {
      emailContentModal.style.display = 'none';
    }
  });

  // Tab switching functionality
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.dataset.tab + '-tab';
      tabContents.forEach(content => {
        content.classList.toggle('active', content.id === tabId);
      });
    });
  });

  // Add this line to try loading mailboxes on startup
  loadMailboxes();
});

// Listen for progress updates from main process
window.api.onProgressUpdate(updateProgressModal);


