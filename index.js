#!/usr/bin/env node
import { GoogleGenerativeAI } from "@google/generative-ai";
import readline from "readline";
import fs from "fs"; 
import { gerarContexto } from "./prompts.js"; 

import { injetarArquivos, processarArquivosCriados, executarComandoSugerido } from "./tools.js"; 

const API_KEY = "REMOVIDO_POR_SEGURANCA"; // <--- GARANTA SUA CHAVE AQUI

if (!API_KEY || API_KEY === "SUA_API_KEY_AQUI") {
  console.error("Erro: API Key não configurada.");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const currentDir = process.cwd();
let fileList = "";
try { files = fs.readdirSync(currentDir).join(", "); } catch (e) { }

const initialContext = gerarContexto(currentDir, fileList);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const chat = model.startChat({
  history: [{ role: "user", parts: [{ text: initialContext }] }],
});

console.log(`\n--- Gemini CLI (Modo Agente Ativado) ---`);

function ask() {
  rl.question("\x1b[36mVocê:\x1b[0m ", async (msg) => {
    if (msg.toLowerCase() === "sair") {
      rl.close();
      return;
    }

    try {
      const mensagemComArquivos = injetarArquivos(msg);

      process.stdout.write("\x1b[33mGemini:\x1b[0m Pensando...");
      
      const result = await chat.sendMessage(mensagemComArquivos);
      const response = await result.response;
      const text = response.text();

      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
      console.log(`\x1b[33mGemini:\x1b[0m ${text}\n`);

      // 1. Verifica se tem arquivos para criar
      const criados = processarArquivosCriados(text);
      if (criados.length > 0) {
        console.log("\x1b[32m[SISTEMA] Arquivos salvos.\x1b[0m\n");
      }

      // 2. Verifica se tem COMANDOS para rodar
      // Passamos o 'rl' para ele poder pedir confirmação
      await executarComandoSugerido(text, rl);

    } catch (error) {
      console.error(`\nErro: ${error.message}\n`);
    }
    
    // Importante: O ask() só volta depois que o comando terminar
    ask();
  });
}

ask();