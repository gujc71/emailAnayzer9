const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { connectImap, fetchEmails, fetchEmailContent, saveMailboxes, imapModule } = require('./imapMgr');
const { saveEmail, getEmailsGroupByFrom, getMailboxesFromDB, getEmailsByMailbox, clearAllTables, getEmailsGroupByRecipient, getEmailsGroupByKeywords, getMailReferences, getEmailsByFromAccount, getEmailsByRecipientAccount, getEmailsByKeyword } = require('./database');
const { screen } = require('electron');

app.disableHardwareAcceleration();

let mainWindow;
// Global IMAP connection
let globalImapConnection = null;
let imapConfig = null;

// Add function to update progress
function updateProgress(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('progress-update', data);
  }
}

// Add function to get or create IMAP connection
async function getImapConnection(config) {
  // If connection doesn't exist or is disconnected, create a new one
  if (!globalImapConnection || globalImapConnection.imap.state === 'disconnected') {
    console.log('Creating new IMAP connection...');
    imapConfig = config;
    const result = await connectImap(config);
    globalImapConnection = result;
  }
  return globalImapConnection;
}

// Add function to close IMAP connection
function closeImapConnection() {
  if (globalImapConnection && globalImapConnection.imap && 
      globalImapConnection.imap.state !== 'disconnected') {
    console.log('Closing IMAP connection...');
    globalImapConnection.imap.end();
    globalImapConnection = null;
    
    // Reset the current open mailbox in the imap.js module
    if (imapModule.resetCurrentOpenMailbox) {
      imapModule.resetCurrentOpenMailbox();
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  //mainWindow.webContents.openDevTools();

  mainWindow.loadFile('index.html');

  // Hide menu bar
  //mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Close IMAP connection when app is about to quit
app.on('before-quit', () => {
  closeImapConnection();
});

// Handle IMAP connection only (no data fetching)
ipcMain.handle('connect-imap-only', async (event, config) => {
  try {
    // We'll make an exception here - we just want to test the connection
    const { imap, boxes } = await connectImap(config);
    
    // Store the config for later use
    imapConfig = config;
    
    // Just check the connection and end it
    imap.end();
    
    return { success: true, mailboxes: boxes };
  } catch (error) {
    console.error('Error connecting to IMAP:', error);
    return { error: error.message };
  }
});

// Handle IMAP connection with initialization (clear and refetch all data)
ipcMain.handle('connect-imap-and-init', async (event, config) => {
  try {
    updateProgress({
      status: 'Connecting to IMAP server...',
      percentage: 0,
      current: 0,
      total: 0,
      currentMailbox: 'Preparing connection...'
    });

    closeImapConnection(); // Close any existing connection
    const connection = await getImapConnection(config);

    updateProgress({
      status: 'Clearing existing data...',
      percentage: 5,
      currentMailbox: 'Initializing database...'
    });

    // Clear all tables before fetching new data
    await clearAllTables();

    updateProgress({
      status: 'Getting mailbox list...',
      percentage: 10,
      currentMailbox: 'Analyzing mailboxes...'
    });
    
    // Fetch all emails from all mailboxes with progress updates
    await fetchAllEmailsWithProgress(connection.imap, connection.boxes, config);

    // Update progress to completion
    updateProgress({
      status: 'Completed!',
      percentage: 100,
      completed: true,
      currentMailbox: 'All emails imported successfully'
    });

    // Notify the renderer process to hide the login form
    event.sender.send('hide-login-form');

    return { mailboxes: connection.boxes };
  } catch (error) {
    console.error('Error connecting to IMAP and initializing:', error);
    return { error: error.message };
  }
});

// Handle IMAP connection
ipcMain.handle('connect-imap', async (event, config) => {
  try {
    const connection = await getImapConnection(config);

    // Fetch all emails from all mailboxes with progress updates
    await fetchAllEmailsWithProgress(connection.imap, connection.boxes, config);

    // Notify the renderer process to hide the login form
    event.sender.send('hide-login-form');

    return { mailboxes: connection.boxes };
  } catch (error) {
    console.error('Error connecting to IMAP:', error);
    return { error: error.message };
  }
});

// Get emails from a mailbox
ipcMain.handle('get-emails', async (event, { config, mailbox }) => {
  try {
    const connection = await getImapConnection(config);
    const emails = await fetchEmails(connection.imap, mailbox);

    for (const email of emails) {
      const { subject, from, to, date, 'message-id': messageId } = email.headers || {};
      const toList = (Array.isArray(to) ? to : [to])
        .flatMap(item => item?.split(',').map(subItem => subItem.trim()) || []);
      await saveEmail(
        mailbox,
        email.id,
        messageId ? messageId[0] : null,
        subject ? subject[0] : null,
        from ? from[0] : null,
        toList.filter(Boolean),
        date ? date[0] : null,
        email.headers.references ? email.headers.references.join(' ') : null
      );
    }

    return emails;
  } catch (error) {
    console.error('Error fetching emails:', error);
    return { error: error.message };
  }
});

// Get full email content
ipcMain.handle('get-email-content', async (event, { config, mailbox, id }) => {
  try {
    const connection = await getImapConnection(config);
    const content = await fetchEmailContent(connection.imap, mailbox, id);
    return content;
  } catch (error) {
    console.error('Error fetching email content:', error);
    return { error: error.message };
  }
});

// Get recent emails
ipcMain.handle('get-emails-groupby-from', async (event, { startDate, endDate }) => {
  try {
    return await getEmailsGroupByFrom(startDate, endDate);
  } catch (error) {
    console.error('Error fetching recent emails:', error.message);
    return { error: error.message };
  }
});

// Get emails grouped by recipient
ipcMain.handle('get-emails-groupby-recipient', async (event, { startDate, endDate }) => {
  try {
    return await getEmailsGroupByRecipient(startDate, endDate);
  } catch (error) {
    console.error('Error fetching emails by recipient:', error.message);
    return { error: error.message };
  }
});

// Get emails grouped by keywords
ipcMain.handle('get-emails-groupby-keywords', async (event, { startDate, endDate }) => {
  try {
    return await getEmailsGroupByKeywords(startDate, endDate);
  } catch (error) {
    console.error('Error fetching emails by keywords:', error.message);
    return { error: error.message };
  }
});

// Get mailboxes
ipcMain.handle('get-mailboxes-from-DB', async () => {
  try {
    return await getMailboxesFromDB();
  } catch (error) {
    console.error('Error getting mailboxes from database:', error);
    return { error: error.message };
  }
});

// Get emails from the database by mailbox
ipcMain.handle('get-emails-by-mailbox', async (event, mailboxPath) => {
  try {
    return await getEmailsByMailbox(mailboxPath);
  } catch (error) {
    console.error('Error fetching emails from database:', error);
    return { error: error.message };
  }
});

// Add this IPC handler for mail references
ipcMain.handle('get-mail-references', async (event, { startDate, endDate }) => {
  try {
    return await getMailReferences(startDate, endDate);
  } catch (error) {
    console.error('Error fetching mail references:', error.message);
    return { error: error.message };
  }
});

// Get emails by from account and date
ipcMain.handle('get-emails-by-from-account', async (event, { fromAccount, date }) => {
  try {
    return await getEmailsByFromAccount(fromAccount, date);
  } catch (error) {
    console.error('Error fetching emails by from account:', error.message);
    return { error: error.message };
  }
});

// Get emails by recipient account and date
ipcMain.handle('get-emails-by-recipient-account', async (event, { recipientAccount, date }) => {
  try {
    return await getEmailsByRecipientAccount(recipientAccount, date);
  } catch (error) {
    console.error('Error fetching emails by recipient account:', error.message);
    return { error: error.message };
  }
});

// Get emails by keyword and date
ipcMain.handle('get-emails-by-keyword', async (event, { keyword, date }) => {
  try {
    return await getEmailsByKeyword(keyword, date);
  } catch (error) {
    console.error('Error fetching emails by keyword:', error.message);
    return { error: error.message };
  }
});

// Function to fetch all emails with progress updates
async function fetchAllEmailsWithProgress(imap, mailboxes, config) {
  // Count total mailboxes first
  const totalMailboxes = countMailboxes(mailboxes);
  let processedMailboxes = 0;

  updateProgress({
    status: 'Mailbox analysis completed',
    percentage: 15,
    total: totalMailboxes,
    current: 0,
    currentMailbox: `Found ${totalMailboxes} mailboxes`
  });

  // First, save all mailboxes to the database
  await saveMailboxes(mailboxes);

  // Then fetch emails from each mailbox
  await processMailboxesWithProgress(imap, mailboxes, config, '', (current, mailboxName) => {
    processedMailboxes = current;
    const percentage = 15 + (current / totalMailboxes) * 80; // 15% to 95%
    
    updateProgress({
      status: `Processing mailboxes... (${current}/${totalMailboxes})`,
      percentage: percentage,
      current: current,
      total: totalMailboxes,
      currentMailbox: mailboxName
    });
  });

  updateProgress({
    status: 'Finalizing...',
    percentage: 95,
    current: totalMailboxes,
    total: totalMailboxes,
    currentMailbox: 'Organizing data...'
  });
}

// Function to count total mailboxes
function countMailboxes(mailboxes) {
  let count = 0;
  for (const [name, box] of Object.entries(mailboxes)) {
    count++;
    if (box.children && Object.keys(box.children).length > 0) {
      count += countMailboxes(box.children);
    }
  }
  return count;
}

// Function to process mailboxes with progress updates
async function processMailboxesWithProgress(imap, mailboxes, config, parentPath = '', progressCallback) {
  let processedCount = 0;

  for (const [name, box] of Object.entries(mailboxes)) {
    const fullPath = parentPath ? `${parentPath}${box.delimiter || '/'}${name}` : name;

    // Process child mailboxes first
    if (box.children && Object.keys(box.children).length > 0) {
      const childCount = await processMailboxesWithProgress(imap, box.children, config, fullPath, progressCallback);
      processedCount += childCount;
    }

    try {
      progressCallback(processedCount + 1, fullPath);
      
      // Add a small delay to make progress visible
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Fetch emails from the current mailbox
      const emails = await fetchEmails(imap, fullPath);

      for (const email of emails) {
        const { subject, from, to, date, 'message-id': messageId } = email.headers || {};
        const toList = (Array.isArray(to) ? to : [to])
          .flatMap(item => item?.split(',').map(subItem => subItem.trim()) || []);
        await saveEmail(
          fullPath,
          email.id,
          messageId ? messageId[0] : null,
          subject ? subject[0] : null,
          from ? from[0] : null,
          toList.filter(Boolean),
          date ? date[0] : null,
          email.headers.references ? email.headers.references.join(' ') : null
        );
      }
      
      processedCount++;
    } catch (error) {
      console.error(`Error fetching emails from mailbox ${fullPath}:`, error);
      processedCount++;
    }
  }

  return processedCount;
}
