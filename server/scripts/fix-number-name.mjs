import Database from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, "../data/grafinorte.db"));

const r = db.prepare("UPDATE wa_phone_numbers SET displayName = 'Victor Marketing' WHERE phoneNumberId = '1311728092015168'").run();
console.log("Changes:", r.changes);
console.log(db.prepare("SELECT id, phoneNumberId, displayName FROM wa_phone_numbers").all());
db.close();
