const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { saveEmail, saveMailbox } = require('./database'); // Import saveEmail function

// Add a variable to track the currently open mailbox
let currentOpenMailbox = null;

function connectImap(config, retryCount = 0) {
  return new Promise((resolve, reject) => {
    // Enhanced config for TLS/SSL connections
    const imapConfig = {
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      tls: config.tls || false,
      secure: config.port === 993 || config.tls, // Auto-detect secure connection for port 993
      tlsOptions: {
        rejectUnauthorized: false, // Allow self-signed certificates
        servername: config.host,
        ciphers: 'HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA',
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3'
      },
      connTimeout: 60000, // Connection timeout: 60 seconds
      authTimeout: 15000,  // Authentication timeout: 15 seconds
      keepalive: {
        interval: 10000,  // Send a 'NOOP' command every 10 seconds
        idleInterval: 300000, // Send an 'IDLE' command every 5 minutes
        forceNoop: true   // Force NOOP even when IDLE is supported
      }
    };

    // Remove debug logging for production
    if (process.env.NODE_ENV === 'development') {
      imapConfig.debug = console.log;
    }

    console.log('Connecting to IMAP with config:', {
      host: imapConfig.host,
      port: imapConfig.port,
      user: imapConfig.user,
      tls: imapConfig.tls,
      secure: imapConfig.secure,
      attempt: retryCount + 1
    });

    const imap = new Imap(imapConfig);

    // Set up timeout for the entire connection process
    const connectionTimeout = setTimeout(() => {
      imap.destroy();
      reject(new Error(`Connection timeout after ${imapConfig.connTimeout}ms`));
    }, imapConfig.connTimeout + 5000);

    imap.once('ready', () => {
      clearTimeout(connectionTimeout);
      console.log('IMAP connection ready');
      imap.getBoxes((err, boxes) => {
        if (err) {
          console.error('Error getting boxes:', err);
          reject(new Error(`Failed to retrieve mailboxes: ${err.message}`));
        } else {
          console.log('Successfully retrieved mailboxes');
          resolve({ imap, boxes });
        }
      });
    });

    imap.once('error', (err) => {
      clearTimeout(connectionTimeout);
      console.error('IMAP connection error:', err);
      
      // Enhanced error messages
      let errorMessage = err.message;
      if (err.code === 'ECONNREFUSED') {
        errorMessage = `Connection refused to ${config.host}:${config.port}. Please check:\n` +
                      `- Server address and port are correct\n` +
                      `- Server is running and accessible\n` +
                      `- Firewall settings allow the connection\n` +
                      `- For port 993: Ensure TLS/SSL is properly configured`;
      } else if (err.code === 'ENOTFOUND') {
        errorMessage = `Host not found: ${config.host}. Please check the server address.`;
      } else if (err.code === 'ETIMEDOUT') {
        errorMessage = `Connection timed out to ${config.host}:${config.port}. The server may be slow or unreachable.`;
      } else if (err.message.includes('certificate')) {
        errorMessage = `TLS Certificate error: ${err.message}. Try disabling certificate validation or check server certificate.`;
      } else if (err.message.toLowerCase().includes('auth') || 
                 err.message.toLowerCase().includes('credential') || 
                 err.message.toLowerCase().includes('login') ||
                 err.message.toLowerCase().includes('password') ||
                 err.message.includes('Invalid credentials') ||
                 err.message.includes('Authentication failed')) {
        
        // Gmail specific error handling
        if (config.host && config.host.toLowerCase().includes('gmail')) {
          errorMessage = `Gmail 인증 실패: ${err.message}\n` +
                        `Gmail 접속을 위해 다음을 확인하세요:\n` +
                        `- 2단계 인증이 활성화되어 있는지 확인\n` +
                        `- 앱 비밀번호를 생성하여 사용해야 합니다 (일반 비밀번호 사용 불가)\n` +
                        `- Google 계정 > 보안 > 앱 비밀번호에서 생성\n` +
                        `- IMAP이 활성화되어 있는지 확인 (Gmail 설정 > 전달 및 POP/IMAP)\n` +
                        `- "보안 수준이 낮은 앱의 액세스"는 더 이상 지원되지 않습니다`;
        } else {
          errorMessage = `인증 실패: ${err.message}\n` +
                        `다음을 확인하세요:\n` +
                        `- 사용자명과 비밀번호가 정확한지 확인\n` +
                        `- 계정이 잠겨있거나 일시정지되지 않았는지 확인\n` +
                        `- 2단계 인증이 올바르게 구성되어 있는지 확인\n` +
                        `- 필요한 경우 앱 전용 비밀번호 사용\n` +
                        `- 이 계정에서 IMAP 액세스가 활성화되어 있는지 확인`;
        }
      }

      // Retry logic for certain errors (but not authentication errors)
      const retryableErrors = ['ETIMEDOUT', 'ECONNRESET', 'EPIPE'];
      const maxRetries = 2;
      
      // Don't retry authentication failures
      const isAuthError = err.message.toLowerCase().includes('auth') || 
                         err.message.toLowerCase().includes('credential') || 
                         err.message.toLowerCase().includes('login') ||
                         err.message.toLowerCase().includes('password') ||
                         err.message.includes('Invalid credentials') ||
                         err.message.includes('Authentication failed');
      
      if (!isAuthError && retryCount < maxRetries && retryableErrors.some(code => err.code === code)) {
        console.log(`Retrying connection (attempt ${retryCount + 2}/${maxRetries + 1})...`);
        setTimeout(() => {
          connectImap(config, retryCount + 1)
            .then(resolve)
            .catch(reject);
        }, (retryCount + 1) * 2000); // Exponential backoff
      } else {
        reject(new Error(errorMessage));
      }
    });

    imap.once('close', () => {
      clearTimeout(connectionTimeout);
      console.log('IMAP connection closed');
    });

    imap.once('end', () => {
      clearTimeout(connectionTimeout);
      console.log('IMAP connection ended');
    });

    try {
      imap.connect();
    } catch (err) {
      clearTimeout(connectionTimeout);
      console.error('Error initiating IMAP connection:', err);
      reject(new Error(`Failed to initiate connection: ${err.message}`));
    }
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
