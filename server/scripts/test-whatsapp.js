// Teste rápido de envio WhatsApp — rode com: node scripts/test-whatsapp.js
require("dotenv/config");

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const TO = "554396970479";

async function main() {
  console.log("Enviando mensagem para", TO, "...");
  const res = await fetch(
    `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: TO,
        type: "template",
        template: {
          name: "hello_world",
          language: { code: "en_US" },
        },
      }),
    }
  );

  const data = await res.json();
  if (res.ok) {
    console.log("✅ Mensagem enviada com sucesso!");
    console.log("Message ID:", data.messages?.[0]?.id);
  } else {
    console.error("❌ Erro:", JSON.stringify(data, null, 2));
  }
}

main().catch(console.error);
