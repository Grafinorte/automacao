import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "data", "grafinorte.db"));

// Find conversation with most messages
const topConv = db.prepare(`
  SELECT conversationId, COUNT(*) as cnt
  FROM wa_messages
  GROUP BY conversationId
  ORDER BY cnt DESC
  LIMIT 1
`).get();

console.log("Conversa com mais msgs:", topConv);

if (topConv) {
  const msgs = db.prepare(`
    SELECT id, waMessageId, direction, text, createdAt
    FROM wa_messages
    WHERE conversationId = ?
    ORDER BY createdAt ASC
    LIMIT 40
  `).all(topConv.conversationId);

  console.log("\nMensagens:");
  msgs.forEach(m => console.log(m));

  // Check for duplicate texts (same text, same direction)
  const seen = {};
  const dups = msgs.filter(m => {
    const key = `${m.direction}|${m.text}`;
    if (seen[key]) return true;
    seen[key] = true;
    return false;
  });
  console.log("\nDuplicatas encontradas:", dups.length, dups);
}

// Check total message count vs distinct waMessageId
const stats = db.prepare(`
  SELECT
    COUNT(*) as total,
    COUNT(DISTINCT waMessageId) as distinctWaId,
    COUNT(CASE WHEN waMessageId IS NULL THEN 1 END) as nullWaId
  FROM wa_messages
`).get();
console.log("\nEstatísticas gerais:", stats);

db.close();
