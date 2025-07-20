# Email Analyzer

An Electron-based application for email analysis.
Includes Korean morphological analysis functionality to enable keyword extraction and classification from email content.

This program was created to test AI performance and learn conversation techniques with ChatGPT, Gemini, Claude, and GitHub Copilot.
Almost everything in this project, including the README.md file, was developed through conversations with AI.

(README.md was edited the most, as AI-generated content tends to be somewhat exaggerated, so it was toned down)

## 📋 Key Features

### 🔌 IMAP Connection and Email Management
- Email collection through IMAP server connection
- Retrieving email metadata and full content

  ![img1](./images/img1.PNG)


### 🗃️ Database Storage and Management
- Local email database using SQLite
- Structured storage of email, recipient, and keyword information
- Duplicate prevention and data integrity assurance
- Index configuration for efficient searching

### 🔍 Korean / English Morphological Analysis
- Korean text analysis using MeCab library (Eunjeon)
- Automatic keyword extraction from email subjects
- Meaningful word filtering through part-of-speech tagging (nouns)
- Fast processing performance based on WASM
- Japanese support possible by changing dictionary since MeCab is used

### 📊 Email Analysis
- Email grouping by sender

  ![img2](./images/img2.PNG)

- Email classification by recipient

  ![img3](./images/img3.PNG)

- Keyword-based email analysis

  ![img4](./images/img4.PNG)

- Email reference relationship tracking

  ![img5](./images/img5.PNG)



## 🚀 How to Run

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation and Execution

0. **Prerequisite - Extract Korean Morphological Analyzer Dictionary**
  
  Extract the lib/libmecab.zip file to create the lib/libmecab.data file.

  Distributed as a compressed file because GitHub only allows files under 100MB.


1. **Install Dependencies**
```bash
npm install
```

2. **Run Application**
```bash
npm start
or
npm run build
```

### Test Data Generation (Optional)

To generate test email data:
```bash
node generate_test_data.js
or
node generate_test_data_ko.js
```

## 📁 Project Structure

```
├── main.js              # Electron main process
├── renderer.js          # Renderer process (UI logic)
├── preload.js           # Preload script
├── imap.js              # IMAP server connection and mail handling
├── database.js          # SQLite database management
├── index.html           # Main UI
├── styles.css           # Stylesheet
├── generate_test_data.js # Test data generation (en)
├── generate_test_data_ko.js # Test data generation (ko)
├── lib/                 # MeCab library files
│   ├── mecab.js
│   ├── libmecab.wasm
│   ├── libmecab.data
│   └── libmecab.cjs
└── emails.db            # SQLite database file
```

## 🔧 Main Technology Stack

- **Frontend**: Electron, HTML5, CSS3, JavaScript
- **Backend**: Node.js
- **Database**: SQLite3
- **Email Protocol**: IMAP
- **Email Parsing**: mailparser
- **Text Analysis**: MeCab (Korean morphological analyzer)

## 💾 Database Schema

### emails table
- Basic email information (subject, sender, date, etc.)
- Classification by mailbox

### recipients table
- Email recipient information
- Relationship setting based on message ID

### keywords table
- Keywords extracted through morphological analysis
- Word frequency and part-of-speech information

### mailboxes table
- IMAP server mailbox structure
- Hierarchical folder management

## 📝 License

MIT

