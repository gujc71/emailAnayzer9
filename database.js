const sqlite3 = require('sqlite3').verbose();
const Mecab = require('./lib/mecab.js');

(async () => {
  await Mecab.waitReady();                 // WASM 초기화가 끝날 때까지 대기

  console.log('Mecab is ready');
})();

const db = new sqlite3.Database('emails.db', async (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
    try {
      await createTables();
    } catch (error) {
      console.error('Error initializing database tables:', error);
    }
  }
});

async function createTables() {
  return new Promise((resolve, reject) => {
    // Create emails table
    db.run(`
      CREATE TABLE IF NOT EXISTS emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mailbox TEXT NOT NULL,
        email_id INTEGER NOT NULL,
        message_id TEXT,
        subject TEXT,
        from_name TEXT,
        from_account TEXT,
        date TEXT,
        time TEXT
      )
    `, (err) => {
      if (err) {
        console.error('Error creating emails table:', err.message);
        reject(err);
        return;
      }
      
      // Create indexes on emails table
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_mailbox_email_id ON emails (mailbox, email_id)`, (err) => {
        if (err) {
          console.error('Error creating index on emails table:', err.message);
          reject(err);
          return;
        }
        
        // Create index for date and from_account on emails table
        db.run(`CREATE INDEX IF NOT EXISTS idx_emails_date_from ON emails (date, from_account)`, (err) => {
          if (err) {
            console.error('Error creating date/from_account index on emails table:', err.message);
            reject(err);
            return;
          }
          
          // Create recipients table
          db.run(`
            CREATE TABLE IF NOT EXISTS recipients (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              message_id TEXT NOT NULL,
              name TEXT,
              account TEXT
            )
          `, (err) => {
            if (err) {
              console.error('Error creating recipients table:', err.message);
              reject(err);
              return;
            }
            
            // Create mail_references table
            db.run(`
              CREATE TABLE IF NOT EXISTS mail_references (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id TEXT NOT NULL,
                reference_id TEXT NOT NULL
              )
            `, (err) => {
              if (err) {
                console.error('Error creating mail_references table:', err.message);
                reject(err);
                return;
              }
              
              // Create index on mail_references table
              db.run(`CREATE INDEX IF NOT EXISTS idx_mail_references_message_id ON mail_references (message_id)`, (err) => {
                if (err) {
                  console.error('Error creating index on mail_references table:', err.message);
                  reject(err);
                  return;
                }
                
                // Create mailboxes table
                db.run(`
                  CREATE TABLE IF NOT EXISTS mailboxes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    path TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    parent_path TEXT,
                    delimiter TEXT,
                    flags TEXT
                  )
                `, (err) => {
                  if (err) {
                    console.error('Error creating mailboxes table:', err.message);
                    reject(err);
                    return;
                  }
                  
                  // Create keywords table
                  db.run(`
                    CREATE TABLE IF NOT EXISTS keywords (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      message_id TEXT NOT NULL,
                      keyword TEXT NOT NULL,
                      FOREIGN KEY (message_id) REFERENCES emails (message_id)
                    )
                  `, (err) => {
                    if (err) {
                      console.error('Error creating keywords table:', err.message);
                      reject(err);
                      return;
                    }
                    
                    // Create index on keywords table
                    db.run(`CREATE INDEX IF NOT EXISTS idx_keywords_keyword ON keywords (keyword)`, (err) => {
                      if (err) {
                        console.error('Error creating index on keywords table:', err.message);
                        reject(err);
                        return;
                      }
                      
                      console.log('All tables created successfully');
                      resolve();
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

function parseAddress(address) {
  const match = address.match(/(.*)<(.+)>/);
  if (match) {
    const name = match[1].trim().replace(/^["']|["']$/g, ''); // Remove leading/trailing quotes
    const account = match[2].trim();
    return { name, account };
  }
  return { name: null, account: address.trim() };
}

function parseDateTime(dateTime) {
  if (!dateTime) return { date: null, time: null };
  const dateObj = new Date(dateTime);
  if (isNaN(dateObj)) return { date: null, time: null };
  const date = dateObj.toISOString().split('T')[0]; // Extract date (YYYY-MM-DD)
  const time = dateObj.toTimeString().split(' ')[0]; // Extract time (HH:MM:SS)
  return { date, time };
}

function saveEmail(mailbox, emailId, messageId, subject, from, toList, dateTime, references) {
  const fromParsed = from ? parseAddress(from) : { name: null, account: null };
  const { date, time } = parseDateTime(dateTime);

  return new Promise((resolve, reject) => {
    db.get(`
      SELECT id FROM emails WHERE mailbox = ? AND email_id = ?
    `, [mailbox, emailId], (err, row) => {
      if (err) {
        console.error('Error checking email existence:', err.message);
        reject(err);
      } else if (row) {
        console.log('Email already exists, skipping save.');
        resolve(); // Skip saving if the email already exists
      } else {
        db.run(`
          INSERT INTO emails (mailbox, email_id, message_id, subject, from_name, from_account, date, time)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          mailbox,
          emailId,
          messageId,
          subject,
          fromParsed.name,
          fromParsed.account,
          date,
          time
        ], function (err) {
          if (err) {
            console.error('Error saving email to database:', err.message);
            reject(err);
          } else {
            const emailDbId = this.lastID; // Get the ID of the inserted email
            Promise.all([
              saveRecipients(messageId, toList),
              saveReferences(messageId, references),
              saveKeywords(messageId, subject)
            ])
              .then(() => resolve())
              .catch((err) => reject(err));
          }
        });
      }
    });
  });
}

function saveRecipients(messageId, toList) {
  if (!toList || toList.length === 0) return Promise.resolve();

  const recipients = toList.map((to) => parseAddress(to));
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO recipients (message_id, name, account)
      VALUES (?, ?, ?)
    `);

    for (const recipient of recipients) {
      stmt.run([messageId, recipient.name, recipient.account], (err) => {
        if (err) {
          console.error('Error saving recipient to database:', err.message);
          reject(err);
        }
      });
    }

    stmt.finalize((err) => {
      if (err) {
        console.error('Error finalizing recipient statement:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function saveReferences(messageId, references) {
  if (!references || references.length === 0) return Promise.resolve();

  const referenceList = references.split(' ');
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO mail_references (message_id, reference_id)
      VALUES (?, ?)
    `);

    for (const referencesId of referenceList) {
      stmt.run([messageId, referencesId], (err) => {
        if (err) {
          console.error('Error saving reference to database:', err.message);
          reject(err);
        }
      });
    }

    stmt.finalize((err) => {
      if (err) {
        console.error('Error finalizing references statement:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function saveKeywords(messageId, subject) {
  if (!subject) return Promise.resolve();

  const keywords = getKeyword(subject);
  if (!keywords || keywords.length === 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO keywords (message_id, keyword)
      VALUES (?, ?)
    `);

    for (const keyword of keywords) {
      stmt.run([messageId, keyword], (err) => {
        if (err) {
          console.error('Error saving keyword to database:', err.message);
          reject(err);
        }
      });
    }

    stmt.finalize((err) => {
      if (err) {
        console.error('Error finalizing keywords statement:', err.message);
        reject(err);
      } else {
        //console.log(`Saved ${keywords.length} keywords for message ${messageId}`);
        resolve();
      }
    });
  });
}

function saveMailbox(path, name, parentPath, delimiter, flags = []) {
  return new Promise((resolve, reject) => {
    // First check if mailbox with this path already exists
    db.get(`SELECT id FROM mailboxes WHERE path = ?`, [path], (err, row) => {
      if (err) {
        console.error('Error checking mailbox existence:', err.message);
        reject(err);
        return;
      }
      
      if (row) {
        // Mailbox already exists, skip insertion
        console.log(`Mailbox ${path} already exists, skipping save.`);
        resolve(row.id);
        return;
      }
      
      // Mailbox doesn't exist, insert it
      const flagsStr = flags ? JSON.stringify(flags) : null;
      
      db.run(`
        INSERT INTO mailboxes (path, name, parent_path, delimiter, flags)
        VALUES (?, ?, ?, ?, ?)
      `, [path, name, parentPath, delimiter, flagsStr], function(err) {
        if (err) {
          console.error('Error saving mailbox to database:', err.message);
          reject(err);
        } else {
          console.log(`Saved new mailbox: ${path}`);
          resolve(this.lastID);
        }
      });
    });
  });
}

function getEmailsGroupByFrom(startDate, endDate) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT from_account, max(from_name) from_name, date, COUNT(*) as count
      FROM emails
      WHERE date BETWEEN ? AND ?
      GROUP BY from_account, date
      ORDER BY from_account, date
    `;
    
    db.all(query, [startDate, endDate], (err, rows) => {
      if (err) {
        console.error('Error querying recent emails:', err.message);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function getEmailsGroupByRecipient(startDate, endDate) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT r.account as recipient_account, r.name as recipient_name, e.date, COUNT(*) as count
      FROM recipients r
      JOIN emails e ON r.message_id = e.message_id
      WHERE e.date BETWEEN ? AND ?
      GROUP BY r.account, e.date
      ORDER BY r.account, e.date
    `;
    
    db.all(query, [startDate, endDate], (err, rows) => {
      if (err) {
        console.error('Error querying emails by recipient:', err.message);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function getEmailsGroupByKeywords(startDate, endDate) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT k.keyword, e.date, COUNT(*) as count
      FROM keywords k
      JOIN emails e ON k.message_id = e.message_id
      WHERE e.date BETWEEN ? AND ?
      GROUP BY k.keyword, e.date
      ORDER BY k.keyword, e.date
    `;
    
    db.all(query, [startDate, endDate], (err, rows) => {
      if (err) {
        console.error('Error querying emails by keywords:', err.message);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function getMailboxesFromDB() {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT * FROM mailboxes ORDER BY path
    `, [], (err, rows) => {
      if (err) {
        console.error('Error querying mailboxes:', err.message);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function getEmailsByMailbox(mailboxPath) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        e.id, 
        e.email_id, 
        e.message_id,
        e.subject, 
        e.from_name, 
        e.from_account,
        e.date,
        e.time,
        GROUP_CONCAT(r.account) as to_accounts
      FROM emails e
      LEFT JOIN recipients r ON e.message_id = r.message_id
      WHERE e.mailbox = ?
      GROUP BY e.id
      ORDER BY e.date DESC, e.time DESC
    `;
    
    db.all(query, [mailboxPath], (err, rows) => {
      if (err) {
        console.error('Error fetching emails for mailbox:', err.message);
        reject(err);
      } else {
        // Transform the rows to match the format expected by the renderer
        const emails = rows.map(row => ({
          id: row.email_id,
          headers: {
            subject: row.subject ? [row.subject] : [],
            from: [row.from_name ? `${row.from_name} <${row.from_account}>` : row.from_account],
            to: row.to_accounts ? row.to_accounts.split(',') : [],
            date: [new Date(row.date + 'T' + row.time).toISOString()]
          },
          messageId: row.message_id
        }));
        resolve(emails);
      }
    });
  });
}

function getMailReferences(startDate, endDate) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        e.message_id, 
        e.subject, 
        e.from_account AS from_email,
        e.from_name,
        e.date,
        e.time,
        r.reference_id,
        ref_e.subject AS ref_subject
      FROM 
        emails e
      JOIN 
        mail_references r ON e.message_id = r.message_id
      LEFT JOIN 
        emails ref_e ON r.reference_id = ref_e.message_id
      WHERE 
        e.date BETWEEN ? AND ?
    `;
    
    db.all(query, [startDate, endDate], (err, rows) => {
      if (err) {
        console.error('Error querying mail references:', err.message);
        reject(err);
      } else {
        // Transform rows into nodes and links for D3
        const result = transformReferencesToGraph(rows);
        resolve(result);
      }
    });
  });
}

function transformReferencesToGraph(rows) {
  const nodes = new Map();
  const links = [];
  const existingLinks = new Set();

  // First pass: create nodes and identify which ones are replies
  rows.forEach(row => {
    const fromDisplay = row.from_name ? `${row.from_name} <${row.from_email}>` : row.from_email;
    const dateTime = `${row.date}T${row.time}`;
    
    // Add source node if it doesn't exist
    if (!nodes.has(row.message_id)) {
      nodes.set(row.message_id, {
        id: row.message_id,
        subject: row.subject,
        from: fromDisplay,
        date: dateTime
      });
    }
    
    // Add target node as a placeholder if it doesn't exist
    if (row.reference_id && !nodes.has(row.reference_id)) {
      nodes.set(row.reference_id, {
        id: row.reference_id,
        // subject: row.ref_subject || 'No information',
        // from: 'Unknown',
        // date: null
      });
    }
    
    // Create link if it doesn't exist - direction is from reference_id (original) to message_id (reply)
    if (row.reference_id) {
      const linkKey = `${row.reference_id}-${row.message_id}`;
      if (!existingLinks.has(linkKey)) {
        links.push({
          source: row.reference_id, // Original message
          target: row.message_id    // Reply
        });
        existingLinks.add(linkKey);
      }
    }
  });

  return {
    nodes: Array.from(nodes.values()),
    links: links
  };
}

function clearAllTables() {
  return new Promise((resolve, reject) => {
    // Begin a transaction for database consistency
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          console.error('Error starting transaction:', err.message);
          reject(err);
          return;
        }
        
        // Drop all tables
        db.run('DROP TABLE IF EXISTS emails', (err) => {
          if (err) {
            console.error('Error dropping emails table:', err.message);
            db.run('ROLLBACK', () => reject(err));
            return;
          }
          
          db.run('DROP TABLE IF EXISTS recipients', (err) => {
            if (err) {
              console.error('Error dropping recipients table:', err.message);
              db.run('ROLLBACK', () => reject(err));
              return;
            }
            
            db.run('DROP TABLE IF EXISTS mail_references', (err) => {
              if (err) {
                console.error('Error dropping mail_references table:', err.message);
                db.run('ROLLBACK', () => reject(err));
                return;
              }
              
              db.run('DROP TABLE IF EXISTS mailboxes', (err) => {
                if (err) {
                  console.error('Error dropping mailboxes table:', err.message);
                  db.run('ROLLBACK', () => reject(err));
                  return;
                }
                
                db.run('DROP TABLE IF EXISTS keywords', (err) => {
                  if (err) {
                    console.error('Error dropping keywords table:', err.message);
                    db.run('ROLLBACK', () => reject(err));
                    return;
                  }
                  
                  // Recreate tables using the common function
                  createTables()
                    .then(() => {
                      // Commit the transaction
                      db.run('COMMIT', (err) => {
                        if (err) {
                          console.error('Error committing transaction:', err.message);
                          db.run('ROLLBACK', () => reject(err));
                          return;
                        }
                        
                        console.log('All tables dropped and recreated successfully');
                        resolve();
                      });
                    })
                    .catch(err => {
                      console.error('Error recreating tables:', err.message);
                      db.run('ROLLBACK', () => reject(err));
                    });
                });
              });
            });
          });
        });
      });
    });
  });
}

const partsofSpeech = ['NNG', 'NNP', 'SL', 'SH'];

function getKeyword(str) {
  try {
    const tokens = Mecab.query(str);
    // console.log('Result:', tokens);
    // console.log('Number of tokens:', tokens.length);
    
    // Extract words from tokens that match the specified parts of speech
    const words = tokens.reduce((acc, token) => {
      if (partsofSpeech.includes(token.pos)) {
        acc.push(token.word);
      }
      return acc;
    }, []);
    
    return words;
  } catch (e) {
    console.error('Error processing:', e);
    return [];
  }
}

function getEmailsByFromAccount(fromAccount, date) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        e.id,
        e.mailbox,
        e.email_id,
        e.message_id,
        e.subject,
        e.from_name,
        e.from_account,
        e.date,
        e.time,
        GROUP_CONCAT(r.account) as to_accounts
      FROM emails e
      LEFT JOIN recipients r ON e.message_id = r.message_id
      WHERE e.from_account = ? AND e.date = ?
      GROUP BY e.id
      ORDER BY e.time DESC
    `;
    
    db.all(query, [fromAccount, date], (err, rows) => {
      if (err) {
        console.error('Error fetching emails by from account:', err.message);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function getEmailsByRecipientAccount(recipientAccount, date) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        e.id,
        e.mailbox,
        e.email_id,
        e.message_id,
        e.subject,
        e.from_name,
        e.from_account,
        e.date,
        e.time,
        GROUP_CONCAT(r.account) as to_accounts
      FROM emails e
      JOIN recipients r ON e.message_id = r.message_id
      WHERE r.account = ? AND e.date = ?
      GROUP BY e.id
      ORDER BY e.time DESC
    `;
    
    db.all(query, [recipientAccount, date], (err, rows) => {
      if (err) {
        console.error('Error fetching emails by recipient account:', err.message);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function getEmailsByKeyword(keyword, date) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        e.id,
        e.mailbox,
        e.email_id,
        e.message_id,
        e.subject,
        e.from_name,
        e.from_account,
        e.date,
        e.time,
        GROUP_CONCAT(r.account) as to_accounts
      FROM emails e
      LEFT JOIN recipients r ON e.message_id = r.message_id
      JOIN keywords k ON e.message_id = k.message_id
      WHERE k.keyword = ? AND e.date = ?
      GROUP BY e.id
      ORDER BY e.time DESC
    `;
    
    db.all(query, [keyword, date], (err, rows) => {
      if (err) {
        console.error('Error fetching emails by keyword:', err.message);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}
// Update exports
module.exports = {
  db,
  saveEmail,
  saveMailbox,
  getEmailsGroupByFrom,
  getEmailsGroupByRecipient,
  getEmailsGroupByKeywords,
  getMailboxesFromDB,
  getEmailsByMailbox,
  getEmailsByFromAccount,
  getEmailsByRecipientAccount,
  getEmailsByKeyword,
  getMailReferences,
  clearAllTables
};
