export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).filter((r) => r.some((cell) => cell.trim() !== "")).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      record[header] = (row[i] ?? "").trim();
    });
    return record;
  });
}

function parseCsvRows(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // ignore, \n handles line breaks
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function detectDelimiter(text: string): string {
  const firstLine = text.split("\n")[0] ?? "";
  return firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
}

const FIELD_ALIASES: Record<string, string[]> = {
  name: ["nome", "name", "contato", "cliente"],
  company: ["empresa", "company", "organizacao", "organização"],
  email: ["email", "e-mail"],
  phone: ["telefone", "phone", "celular", "whatsapp", "fone"],
  notes: ["notas", "notes", "observacoes", "observações", "obs"],
};

export function mapCsvRowToContact(row: Record<string, string>) {
  function find(field: keyof typeof FIELD_ALIASES) {
    const aliases = FIELD_ALIASES[field];
    for (const key of Object.keys(row)) {
      if (aliases.includes(key)) return row[key];
    }
    return "";
  }

  return {
    name: find("name"),
    company: find("company") || null,
    email: find("email") || null,
    phone: find("phone") || null,
    notes: find("notes") || null,
  };
}
