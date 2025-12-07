import dotenv from "dotenv";
import path from "path";
import os from "os";

// Configura Env (igual ao seu app principal)
const localEnvPath = path.join(process.cwd(), ".env");
const globalEnvPath = path.join(os.homedir(), ".gemini.env");

dotenv.config({ path: localEnvPath });
if (!process.env.GEMINI_API_KEY) {
  dotenv.config({ path: globalEnvPath });
}

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("❌ Erro: API Key não encontrada.");
  process.exit(1);
}

console.log(`🔑 Usando Key final: ...${API_KEY.slice(-4)}`);
console.log("📡 Consultando API do Google...");

async function run() {
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`
    );
    const data = await resp.json();

    if (data.error) {
      console.error("❌ Erro da API:", data.error.message);
      return;
    }

    console.log("\n✅ MODELOS DISPONÍVEIS PARA VOCÊ:");
    console.log("==================================");

    // Filtra só os que geram texto (chat)
    const models = data.models
      .filter((m) => m.supportedGenerationMethods.includes("generateContent"))
      .map((m) => m.name.replace("models/", "")); // Limpa o nome

    models.forEach((m) => console.log(`- "${m}"`));

    console.log("==================================");
  } catch (e) {
    console.error("Erro na requisição:", e.message);
  }
}

run();
