const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { saveEmail, saveMailbox } = require('./database'); // Import saveEmail function

// Add a variable to track the currently open mailbox
let currentOpenMailbox = null;

function connectImap(config) {
  return new Promise((resolve, reject) => {
    const imap = new Imap(config);

    imap.once('ready', () => {
      imap.getBoxes((err, boxes) => {
        if (err) {
          reject(err);
        } else {
          resolve({ imap, boxes });
        }
      });
    });

    imap.once('error', (err) => {
      reject(err);
    });

    imap.connect();
  });
}

// You should also update fetchEmails to track the currently open mailbox
function fetchEmails(imap, mailbox) {
  return new Promise((resolve, reject) => {
    imap.openBox(mailbox, true, (err, box) => {
      if (err) {
        reject(err);
        return;
      }
      
      // Update the currently open mailbox
      currentOpenMailbox = mailbox;

      if (!box.messages.total || box.messages.total === 0) {
        resolve([]);
        return;
      }

      const emails = [];

      // Use UID-based search to get all UIDs in the mailbox
      imap.search(['ALL'], (err, uids) => {
        if (err) {
          reject(err);
          return;
        }

        if (!uids || uids.length === 0) {
          resolve([]);
          return;
        }

        const fetch = imap.fetch(uids, {
          bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID REFERENCES)'],
          struct: true,
          envelope: true
        });

        fetch.on('message', (msg, seqno) => {
          const email = { id: null, headers: null };

          msg.on('body', (stream) => {
            let buffer = '';
            stream.on('data', (chunk) => {
              buffer += chunk.toString('utf8');
            });

            stream.on('end', () => {
              email.headers = Imap.parseHeader(buffer);
            });
          });

          msg.once('attributes', (attrs) => {
            email.id = attrs.uid;
          });

          msg.once('end', () => {
            emails.push(email);
          });
        });

        fetch.once('error', (err) => {
          reject(err);
        });

        fetch.once('end', () => {
          resolve(emails);
        });
      });
    });
  });
}

function fetchEmailContent(imap, mailbox, id) {
  return new Promise((resolve, reject) => {
    // Only open the mailbox if it's different from the currently open one
    const openMailboxIfNeeded = () => {
      if (currentOpenMailbox === mailbox) {
        // Mailbox already open, proceed directly
        return Promise.resolve();
      } else {
        // Different mailbox, need to open it
        return new Promise((resolveOpen, rejectOpen) => {
          imap.openBox(mailbox, true, (err) => {
            if (err) {
              rejectOpen(err);
            } else {
              currentOpenMailbox = mailbox;
              resolveOpen();
            }
          });
        });
      }
    };

    openMailboxIfNeeded()
      .then(() => {
        const fetch = imap.fetch(id, { bodies: '' });

        fetch.on('message', (msg) => {
          msg.on('body', (stream) => {
            const chunks = [];
            stream.on('data', (chunk) => {
              chunks.push(chunk);
            });

            stream.on('end', () => {
              const buffer = Buffer.concat(chunks);
              simpleParser(buffer, (err, parsed) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(parsed);
                }
              });
            });
          });
        });

        fetch.once('error', (err) => {
          reject(err);
        });

        fetch.once('end', () => {
          // Remove imap.end() to keep the connection open
        });
      })
      .catch(reject);
  });
}

// Add this function to save mailboxes recursively

async function saveMailboxes(mailboxes, parentPath = '') {
  for (const [name, box] of Object.entries(mailboxes)) {
    const fullPath = parentPath ? `${parentPath}${box.delimiter || '/'}${name}` : name;
    
    // Save this mailbox
    await saveMailbox(fullPath, name, parentPath || null, box.delimiter || '/', box.attribs || []);
    
    // Recursively save children
    if (box.children && Object.keys(box.children).length > 0) {
      await saveMailboxes(box.children, fullPath);
    }
  }
}

// Add a function to reset the current mailbox
function resetCurrentOpenMailbox() {
  currentOpenMailbox = null;
}

module.exports = {
  connectImap,
  fetchEmails,
  fetchEmailContent,
  saveMailboxes,
  resetCurrentOpenMailbox // Add this line
};
