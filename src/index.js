#!/usr/bin/env node
import 'dotenv/config';
import { GoogleGenerativeAI } from "@google/generative-ai";
import readline from "readline";
import fs from "fs"; 
import { gerarContexto } from "./utils/prompts.js"; 
import { 
  injetarArquivos, 
  extrairSugestoesArquivos, 
  confirmarESalvarArquivos, 
  executarComandoSugerido 
} from "./utils/tools.js"; 

// --- CONFIGURAÇÃO ---
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("Erro: A variável GEMINI_API_KEY não foi encontrada no arquivo .env");
  console.error("Crie um arquivo .env na raiz com o conteúdo: GEMINI_API_KEY=sua_chave");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

// Função auxiliar para pegar contexto atualizado
function getContextoAtual() {
    const dir = process.cwd();
    let files = "";
    try { files = fs.readdirSync(dir).join(", "); } catch (e) { files = "Erro de leitura"; }
    return gerarContexto(dir, files);
}

// Função de Retry (Definida fora do loop para melhor performance)
async function enviarMensagemComRetry(chat, mensagem) {
  const maxTentativas = 3;
  for (let i = 1; i <= maxTentativas; i++) {
    try {
      return await chat.sendMessage(mensagem);
    } catch (error) {
      // Se for erro 503 (Overloaded) ou 500, tenta de novo
      if ((error.message.includes("503") || error.message.includes("overloaded")) && i < maxTentativas) {
        console.log(`\x1b[33m[SISTEMA] Servidor do Google ocupado. Tentativa ${i}/${maxTentativas}... Aguardando...\x1b[0m`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Espera 2s
      } else {
        throw error; // Erro fatal ou acabaram as tentativas
      }
    }
  }
}

// Inicializa modelo
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let chatHistory = [
    { role: "user", parts: [{ text: getContextoAtual() }] },
    { role: "model", parts: [{ text: "Sistema pronto. Aguardando instruções." }] }
];

const chat = model.startChat({ history: chatHistory });

console.log(`\n--- Gemini CLI (Modo Seguro Interativo) ---`);

function ask() {
  rl.question("\x1b[36mVocê:\x1b[0m ", async (msg) => {
    if (msg.toLowerCase() === "sair") {
      rl.close();
      return;
    }

    // Contexto dinâmico
    const contextoFresco = `Contexto Atualizado: Pasta ${process.cwd()}. Arquivos: ${fs.readdirSync(process.cwd()).join(", ")}`;
    
    try {
      const mensagemProcessada = injetarArquivos(msg);

      process.stdout.write("\x1b[33mGemini:\x1b[0m Pensando...");
      
      // Aqui chamamos a função de retry que definimos lá em cima
      const result = await enviarMensagemComRetry(chat, contextoFresco + "\n\nUsuário disse: " + mensagemProcessada);
      const response = await result.response;
      const text = response.text();

      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
      console.log(`\x1b[33mGemini:\x1b[0m ${text}\n`);

      // 1. FASE DE ARQUIVOS
      const sugestoesArquivos = extrairSugestoesArquivos(text);
      await confirmarESalvarArquivos(sugestoesArquivos, rl);

      // 2. FASE DE COMANDOS
      await executarComandoSugerido(text, rl);

    } catch (error) {
      console.error(`\nErro: ${error.message}\n`);
    }
    
    ask();
  });
}

ask();