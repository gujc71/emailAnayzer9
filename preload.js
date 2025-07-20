const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  connectImapOnly: (config) => ipcRenderer.invoke('connect-imap-only', config),
  connectImapAndInit: (config) => ipcRenderer.invoke('connect-imap-and-init', config),
  getEmails: (params) => ipcRenderer.invoke('get-emails', params),
  getEmailsByMailbox: (mailboxPath) => ipcRenderer.invoke('get-emails-by-mailbox', mailboxPath),
  getEmailContent: (params) => ipcRenderer.invoke('get-email-content', params),
  onHideLoginForm: (callback) => ipcRenderer.on('hide-login-form', callback),

  getMailboxes: () => ipcRenderer.invoke('get-mailboxes-from-DB'), 
  getEmailsGroupByFrom: (params) => ipcRenderer.invoke('get-emails-groupby-from', params),
  getEmailsGroupByRecipient: (params) => ipcRenderer.invoke('get-emails-groupby-recipient', params),
  getEmailsGroupByKeywords: (params) => ipcRenderer.invoke('get-emails-groupby-keywords', params),
  
  getEmailsByFromAccount: (params) => ipcRenderer.invoke('get-emails-by-from-account', params),
  getEmailsByRecipientAccount: (params) => ipcRenderer.invoke('get-emails-by-recipient-account', params),
  getEmailsByKeyword: (params) => ipcRenderer.invoke('get-emails-by-keyword', params),
  
  invoke: (channel, args) => ipcRenderer.invoke(channel, args),
  getMailReferences: (params) => ipcRenderer.invoke('get-mail-references', params),
  
  // Progress related APIs
  onProgressUpdate: (callback) => ipcRenderer.on('progress-update', (event, data) => callback(data))
});
