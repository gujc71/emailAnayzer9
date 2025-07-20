const { saveEmail, saveMailbox, clearAllTables } = require('./database.js');
const Mecab = require('./lib/mecab.js');

// Test accounts
const testAccounts = [
  { name: "테스트1", email: "test1@gujc71.com" },
  { name: "테스트2", email: "test2@gujc71.com" },
  { name: "테스트3", email: "test3@gujc71.com" },
  { name: "테스트4", email: "test4@gujc71.com" },
  { name: "테스트5", email: "test5@gujc71.com" },
  { name: "테스트6", email: "test6@gujc71.com" },
  { name: "테스트7", email: "test7@gujc71.com" },
  { name: "테스트8", email: "test8@gujc71.com" },
  { name: "테스트9", email: "test9@gujc71.com" },
  { name: "테스트10", email: "test10@gujc71.com" }
];

// Advertising-related subject templates in Korean
const subjectTemplates = [
  "광고 캠페인 기획안 검토 요청",
  "신제품 마케팅 전략 회의",
  "온라인 광고 성과 보고서",
  "브랜드 프로모션 예산 승인",
  "소셜미디어 광고 콘텐츠 검토",
  "광고 크리에이티브 제작 일정",
  "디지털 마케팅 ROI 분석",
  "광고주 미팅 결과 공유",
  "마케팅 KPI 달성률 보고",
  "광고 소재 승인 요청",
  "타겟 고객층 분석 자료",
  "광고 효과 측정 결과",
  "마케팅 예산 배분 계획",
  "브랜딩 전략 수정안",
  "광고 플랫폼 성과 비교",
  "프로모션 이벤트 기획",
  "광고 카피 검토 및 수정",
  "마케팅 팀 업무 배정",
  "광고 송출 스케줄 조정",
  "고객 피드백 분석 보고서",
  "경쟁사 광고 분석 자료",
  "광고 비용 최적화 방안",
  "브랜드 인지도 조사 결과",
  "마케팅 자동화 도구 도입",
  "광고 성과 개선 제안"
];

// Generate random date within last 6 months
function getRandomDate() {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - (6 * 30 * 24 * 60 * 60 * 1000));
  const randomTime = sixMonthsAgo.getTime() + Math.random() * (now.getTime() - sixMonthsAgo.getTime());
  return new Date(randomTime);
}

// Generate random message ID
function generateMessageId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  return `<${timestamp}.${random}@gujc71.com>`;
}

// Get random element from array
function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Get multiple random recipients (excluding the sender)
function getRandomRecipients(excludeAccount, minCount = 1, maxCount = 4) {
  const availableAccounts = testAccounts.filter(acc => acc.email !== excludeAccount);
  const count = Math.floor(Math.random() * (maxCount - minCount + 1)) + minCount;
  const recipients = [];
  
  for (let i = 0; i < count; i++) {
    const recipient = getRandomElement(availableAccounts);
    const recipientString = `${recipient.name}<${recipient.email}>`;
    if (!recipients.includes(recipientString)) {
      recipients.push(recipientString);
    }
  }
  
  return recipients;
}

// Store message IDs for creating references
const generatedMessageIds = [];

// Generate INBOX emails (Test1 as recipient)
async function generateInboxEmails() {
  console.log('Generating INBOX emails...');
  const promises = [];
  
  for (let i = 1; i <= 1000; i++) {
    const sender = getRandomElement(testAccounts.filter(acc => acc.email !== "test1@gujc71.com"));
    let subject = getRandomElement(subjectTemplates) + ` - ${i}`;
    const dateTime = getRandomDate();
    const messageId = generateMessageId();
    const fromString = `${sender.name}<${sender.email}>`;
    
    // Always include Test1 as recipient, plus other random recipients
    const otherRecipients = getRandomRecipients("test1@gujc71.com", 0, 3);
    const toList = ["Test1<test1@gujc71.com>", ...otherRecipients];
    
    // Create references for some emails (5% chance of being a reply)
    let references = null;
    if (generatedMessageIds.length > 0 && Math.random() < 0.05) {
      // This is a reply - get 1-3 previous message IDs as references
      const refCount = Math.min(Math.floor(Math.random() * 3) + 1, generatedMessageIds.length);
      const selectedRefs = [];
      
      for (let j = 0; j < refCount; j++) {
        const randomIndex = Math.floor(Math.random() * generatedMessageIds.length);
        const refId = generatedMessageIds[randomIndex];
        if (!selectedRefs.includes(refId)) {
          selectedRefs.push(refId);
        }
      }
      
      if (selectedRefs.length > 0) {
        references = selectedRefs.join(' ');
        subject = "Re: " + subject; // Add Re: prefix for replies
      }
    }
    
    // Store this message ID for future references
    generatedMessageIds.push(messageId);
    
    const promise = saveEmail(
      "INBOX",
      i,
      messageId,
      subject,
      fromString,
      toList,
      dateTime.toISOString(),
      references
    );
    
    promises.push(promise);
    
    // Process in batches of 50 to avoid overwhelming the database
    if (i % 50 === 0) {
      await Promise.all(promises.splice(0, 50));
      console.log(`Generated ${i} INBOX emails...`);
    }
  }
  
  // Process remaining promises
  if (promises.length > 0) {
    await Promise.all(promises);
  }
  
  console.log('INBOX emails generation completed!');
}

// Generate Sent emails (Test1 as sender)
async function generateSentEmails() {
  console.log('Generating Sent emails...');
  const promises = [];
  
  for (let i = 1; i <= 100; i++) {
    let subject = getRandomElement(subjectTemplates) + ` - Sent ${i}`;
    const dateTime = getRandomDate();
    const messageId = generateMessageId();
    const fromString = "Test1<test1@gujc71.com>";
    
    // Random recipients (excluding Test1)
    const toList = getRandomRecipients("test1@gujc71.com", 1, 5);
    
    // Create references for some sent emails (8% chance of being a reply)
    let references = null;
    if (generatedMessageIds.length > 0 && Math.random() < 0.08) {
      // This is a reply - get 1-2 previous message IDs as references
      const refCount = Math.min(Math.floor(Math.random() * 2) + 1, generatedMessageIds.length);
      const selectedRefs = [];
      
      for (let j = 0; j < refCount; j++) {
        const randomIndex = Math.floor(Math.random() * generatedMessageIds.length);
        const refId = generatedMessageIds[randomIndex];
        if (!selectedRefs.includes(refId)) {
          selectedRefs.push(refId);
        }
      }
      
      if (selectedRefs.length > 0) {
        references = selectedRefs.join(' ');
        subject = "Re: " + subject; // Add Re: prefix for replies
      }
    }
    
    // Store this message ID for future references
    generatedMessageIds.push(messageId);
    
    const promise = saveEmail(
      "Sent",
      i,
      messageId,
      subject,
      fromString,
      toList,
      dateTime.toISOString(),
      references
    );
    
    promises.push(promise);
    
    // Process in batches of 25
    if (i % 25 === 0) {
      await Promise.all(promises.splice(0, 25));
      console.log(`Generated ${i} Sent emails...`);
    }
  }
  
  // Process remaining promises
  if (promises.length > 0) {
    await Promise.all(promises);
  }
  
  console.log('Sent emails generation completed!');
}

// Generate specific email threads with references
async function generateEmailThreads() {
  console.log('Generating email threads with references...');
  
  // Create 5 email threads, each with 3-5 messages
  for (let threadNum = 1; threadNum <= 5; threadNum++) {
    const threadMessageIds = [];
    const threadLength = Math.floor(Math.random() * 3) + 3; // 3-5 messages per thread
    const threadSubject = `${getRandomElement(subjectTemplates)} - Thread ${threadNum}`;
    
    console.log(`Creating thread ${threadNum} with ${threadLength} messages...`);
    
    for (let msgNum = 1; msgNum <= threadLength; msgNum++) {
      const messageId = generateMessageId();
      let subject = threadSubject;
      let references = null;
      
      // First message in thread (original message)
      if (msgNum === 1) {
        subject = threadSubject;
      } else {
        // Reply messages - add Re: prefix and references
        subject = `Re: ${threadSubject}`;
        
        // For replies, reference only 1-2 previous messages in the thread
        if (threadMessageIds.length > 0) {
          // Reference 1-2 previous messages randomly
          const refCount = Math.min(Math.floor(Math.random() * 2) + 1, threadMessageIds.length);
          const selectedRefs = [];
          
          // Always include the immediate previous message
          selectedRefs.push(threadMessageIds[threadMessageIds.length - 1]);
          
          // Add some random previous messages
          for (let i = 0; i < refCount - 1; i++) {
            const randomIndex = Math.floor(Math.random() * threadMessageIds.length);
            const refId = threadMessageIds[randomIndex];
            if (!selectedRefs.includes(refId)) {
              selectedRefs.push(refId);
            }
          }
          
          references = selectedRefs.join(' ');
        }
      }
      
      // Alternate between different senders and recipients to simulate conversation
      let fromString, toList;
      if (msgNum % 2 === 1) {
        // Odd messages from Test1 to others
        fromString = "Test1<test1@gujc71.com>";
        toList = getRandomRecipients("test1@gujc71.com", 1, 3);
      } else {
        // Even messages from others to Test1
        const sender = getRandomElement(testAccounts.filter(acc => acc.email !== "test1@gujc71.com"));
        fromString = `${sender.name}<${sender.email}>`;
        toList = ["Test1<test1@gujc71.com>"];
        
        // Sometimes add additional recipients
        if (Math.random() < 0.3) {
          const additionalRecipients = getRandomRecipients("test1@gujc71.com", 1, 2);
          toList.push(...additionalRecipients);
        }
      }
      
      const dateTime = getRandomDate();
      
      // Store message ID for this thread
      threadMessageIds.push(messageId);
      generatedMessageIds.push(messageId);
      
      // Determine mailbox based on sender
      const mailbox = fromString.includes("test1@gujc71.com") ? "Sent" : "INBOX";
      const emailId = Date.now() + Math.floor(Math.random() * 1000); // Unique email ID
      
      await saveEmail(
        mailbox,
        emailId,
        messageId,
        subject,
        fromString,
        toList,
        dateTime.toISOString(),
        references
      );
      
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  
  console.log('Email threads generation completed!');
}

// Main function to generate all test data
async function generateTestData() {
  try {
    console.log('Starting test data generation...');
    
    // Wait for Mecab to be ready
    console.log('Waiting for Mecab to initialize...');
    await Mecab.waitReady();
    console.log('Mecab is ready!');
    
    // Clear existing data (optional - comment out if you want to keep existing data)
    console.log('Clearing existing data...');
    await clearAllTables();
    
    // Create mailboxes
    console.log('Creating mailboxes...');
    await saveMailbox('INBOX', 'INBOX', null, '/', ['\\HasChildren']);
    await saveMailbox('Sent', 'Sent', null, '/', ['\\HasNoChildren']);
    
    // Generate test emails
    await generateInboxEmails();
    await generateSentEmails();
    
    // Generate specific email threads with references
    await generateEmailThreads();
    
    console.log('Test data generation completed successfully!');
    console.log('Generated:');
    console.log('- 1000 emails in INBOX (Test1 as recipient, ~5% with references)');
    console.log('- 100 emails in Sent (Test1 as sender, ~8% with references)');
    console.log('- 5 email threads with 3-5 messages each (structured conversations)');
    console.log(`- Total message IDs stored: ${generatedMessageIds.length}`);
    
  } catch (error) {
    console.error('Error generating test data:', error);
  }
}

// Run the test data generation
generateTestData();
