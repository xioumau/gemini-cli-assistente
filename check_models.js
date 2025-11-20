import 'dotenv/config';
import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("Erro: Chave não encontrada no .env");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

async function listarModelosDisponiveis() {
  console.log("--- Verificando modelos compatíveis com sua API Key ---");
  
  try {
    // O truque aqui é listar todos e filtrar
    // A biblioteca às vezes retorna uma lista crua, vamos formatar
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
    const data = await response.json();

    if (!data.models) {
        console.log("Nenhum modelo encontrado.");
        return;
    }

    const textModels = data.models.filter(m => 
        m.supportedGenerationMethods.includes("generateContent")
    );

    console.log(`\nEncontrados ${textModels.length} modelos de texto/chat.\n`);
    console.log("RECOMENDAÇÃO DE HIERARQUIA (Copie para o seu código):");
    console.log("-----------------------------------------------------");

    // Vamos categorizar para te ajudar a escolher
    const flashModels = textModels.filter(m => m.name.includes("flash") && !m.name.includes("8b"));
    const proModels = textModels.filter(m => m.name.includes("pro") && !m.name.includes("vision"));
    const stableModels = textModels.filter(m => !m.name.includes("exp") && !m.name.includes("preview"));

    console.log("\n⚡ VELOCIDADE (Flash) - Ideais para CLI e respostas rápidas:");
    flashModels.forEach(m => console.log(`   "${m.name.replace("models/", "")}"`));

    console.log("\n🧠 INTELIGÊNCIA (Pro) - Ideais para raciocínio complexo:");
    proModels.forEach(m => console.log(`   "${m.name.replace("models/", "")}"`));

    console.log("\n🛡️ ESTABILIDADE (Versões Fixas) - Menor chance de erro 404/503:");
    stableModels.forEach(m => console.log(`   "${m.name.replace("models/", "")}"`));

  } catch (error) {
    console.error("Erro ao listar modelos:", error.message);
  }
}

listarModelosDisponiveis();