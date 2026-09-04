import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RAILWAY_ADMIN_ID = "cmsxhmstk000022pa38on4p3u";
const LOCAL_ADMIN_ID = "cmqib4wj000003k9d6hyez0bi";
const DATA_DIR = join(__dirname, "railway-import");
const DB_PATH = join(__dirname, "..", "data", "grafinorte.db");

const db = new Database(DB_PATH);

const contacts = JSON.parse(readFileSync(join(DATA_DIR, "contacts.json"), "utf8"));
const conversations = JSON.parse(readFileSync(join(DATA_DIR, "conversations.json"), "utf8"));
const messages = JSON.parse(readFileSync(join(DATA_DIR, "messages.json"), "utf8"));

console.log(`Importing: ${contacts.length} contacts, ${conversations.length} conversations, ${messages.length} messages`);

// Build a map of Railway contact ID → local contact ID for phone conflicts
// (contacts where the phone already exists locally under a different ID)
const contactIdMap = {};
for (const c of contacts) {
  const local = db.prepare("SELECT id FROM wa_contacts WHERE phone = ?").get(c.phone);
  if (local && local.id !== c.id) {
    contactIdMap[c.id] = local.id;
  }
}
if (Object.keys(contactIdMap).length > 0) {
  console.log("Contact ID remappings (Railway → Local):");
  for (const [from, to] of Object.entries(contactIdMap)) {
    console.log(`  ${from} → ${to}`);
  }
}

const insertContact = db.prepare(`
  INSERT OR IGNORE INTO wa_contacts (id, phone, name, notes, crmContactId, createdAt, updatedAt)
  VALUES (@id, @phone, @name, @notes, @crmContactId, @createdAt, @updatedAt)
`);

const insertConversation = db.prepare(`
  INSERT OR IGNORE INTO wa_conversations (id, contactId, status, unreadCount, lastMessageAt, lastMessageText, assignedToId, phoneNumberId, pinned, createdAt, updatedAt)
  VALUES (@id, @contactId, @status, @unreadCount, @lastMessageAt, @lastMessageText, @assignedToId, @phoneNumberId, @pinned, @createdAt, @updatedAt)
`);

const insertMessage = db.prepare(`
  INSERT OR IGNORE INTO wa_messages (id, conversationId, direction, isInternal, text, waMessageId, status, sentById, mediaType, mediaUrl, filename, replyToId, createdAt)
  VALUES (@id, @conversationId, @direction, @isInternal, @text, @waMessageId, @status, @sentById, @mediaType, @mediaUrl, @filename, @replyToId, @createdAt)
`);

const runImport = db.transaction(() => {
  let contactsInserted = 0;
  for (const c of contacts) {
    const result = insertContact.run(c);
    if (result.changes) contactsInserted++;
  }
  console.log(`Contacts: ${contactsInserted}/${contacts.length} inserted`);

  let convsInserted = 0;
  for (const c of conversations) {
    const mapped = {
      ...c,
      contactId: contactIdMap[c.contactId] ?? c.contactId,
    };
    const result = insertConversation.run(mapped);
    if (result.changes) convsInserted++;
  }
  console.log(`Conversations: ${convsInserted}/${conversations.length} inserted`);

  let msgsInserted = 0;
  for (const m of messages) {
    const mapped = {
      ...m,
      sentById: m.sentById === RAILWAY_ADMIN_ID ? LOCAL_ADMIN_ID : m.sentById,
    };
    const result = insertMessage.run(mapped);
    if (result.changes) msgsInserted++;
  }
  console.log(`Messages: ${msgsInserted}/${messages.length} inserted`);
});

runImport();

const stats = db.prepare(`SELECT
  (SELECT COUNT(*) FROM wa_contacts) AS contacts,
  (SELECT COUNT(*) FROM wa_conversations) AS conversations,
  (SELECT COUNT(*) FROM wa_messages) AS messages
`).get();

console.log("\nDB totals after import:");
console.log(`  wa_contacts: ${stats.contacts}`);
console.log(`  wa_conversations: ${stats.conversations}`);
console.log(`  wa_messages: ${stats.messages}`);

db.close();
