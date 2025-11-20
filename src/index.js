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
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

// === LISTA DE PRIORIDADE DE MODELOS (FALLBACK) ===
const MODEL_OPTIONS = [
    // 1. Velocidade e Capacidade Máxima
    "gemini-2.5-flash",       
    "gemini-2.5-pro",         

    // 2. Versões Fixas e Robustas
    "gemini-2.0-flash-001",   
    "gemini-2.0-flash",       
    
    // 3. Refúgio Final (Estabilidade total)
    "gemini-pro-latest"       
];

// Variável para lembrar qual modelo funcionou por último (Stickiness)
let currentModelName = MODEL_OPTIONS[0];

// --- FUNÇÃO CORE: SMART REQUEST (COM FALLBACK) ---
async function smartGenerate(history, newMessage, isChatMode) {
    let lastError = null;

    for (const modelName of MODEL_OPTIONS) {
        try {
            // Pequeno aviso visual se estivermos a trocar de modelo (fallback)
            if (modelName !== MODEL_OPTIONS[0]) {
                process.stdout.write(`\x1b[90m(Tentando via ${modelName}...)\x1b[0m `);
            }

            const model = genAI.getGenerativeModel({ model: modelName });
            let responseText = "";

            if (isChatMode) {
                // Modo Chat: Recriamos a sessão com o histórico atual
                const chat = model.startChat({ history: history });
                const result = await chat.sendMessage(newMessage);
                const response = await result.response;
                responseText = response.text();
            } else {
                // Modo Pipe: Sem histórico, apenas gera conteúdo
                const result = await model.generateContent(newMessage);
                const response = await result.response;
                responseText = response.text();
            }

            // SUCESSO! Atualizamos o modelo padrão para o futuro
            currentModelName = modelName;
            return { text: responseText, usedModel: modelName };

        } catch (error) {
            lastError = error;
            // Se for erro de sobrecarga (503) ou erro interno (500), tenta o próximo
            const isOverloaded = error.message.includes("503") || error.message.includes("overloaded") || error.message.includes("500");
            
            if (isOverloaded) {
                continue; // Pula para o próximo modelo da lista
            } else {
                throw error; // Se for outro erro (ex: chave inválida), para tudo.
            }
        }
    }

    throw new Error(`Todos os modelos falharam. Último erro: ${lastError.message}`);
}

// --- AUXILIARES ---
function getContextoAtual() {
    const dir = process.cwd();
    let files = "";
    try { files = fs.readdirSync(dir).join(", "); } catch (e) { files = "Erro de leitura"; }
    return gerarContexto(dir, files);
}

function readStdin() {
    return new Promise((resolve) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', chunk => data += chunk);
        process.stdin.on('end', () => resolve(data));
    });
}

// --- INICIALIZAÇÃO ---
async function init() {
    const initialContext = getContextoAtual();

    // === MODO PIPE ===
    if (!process.stdin.isTTY) {
        console.log(`\x1b[34m[SISTEMA] Lendo Pipe...\x1b[0m`);
        const pipedData = await readStdin();
        
        if (!pipedData.trim()) {
            console.error("\x1b[31mErro: Pipe vazio.\x1b[0m");
            process.exit(1);
        }

        const promptCompleto = `${initialContext}\n\n=== DADOS DO PIPE ===\n${pipedData}\n\nInstrução: Analise e responda.`;

        try {
            process.stdout.write("\x1b[33mGemini:\x1b[0m Processando...");
            
            const result = await smartGenerate([], promptCompleto, false);
            
            readline.cursorTo(process.stdout, 0);
            readline.clearLine(process.stdout, 0);
            
            console.log(result.text.trim());
            // Log técnico discreto para saber qual modelo respondeu
            console.error(`\n\x1b[90m[Meta: Respondido por ${result.usedModel}]\x1b[0m`); 

        } catch (error) {
            console.error(`\n\x1b[31mFalha Total:\x1b[0m ${error.message}`);
        }
        process.exit(0);

    } else {
        // === MODO INTERATIVO ===
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

        let chatHistory = [
            { role: "user", parts: [{ text: initialContext }] },
            { role: "model", parts: [{ text: "Sistema pronto. Aguardando instruções." }] }
        ];

        console.log(`\n--- Gemini CLI (Alta Disponibilidade) ---`);

        function ask() {
            rl.question("\x1b[36mVocê:\x1b[0m ", async (msg) => {
                if (msg.toLowerCase() === "sair") { rl.close(); return; }
                
                const contextoAtual = `Contexto Atualizado: Pasta ${process.cwd()}. Arquivos: ${fs.readdirSync(process.cwd()).join(", ")}`;
                
                try {
                    const msgProcessada = injetarArquivos(msg);
                    const promptFinal = contextoAtual + "\n\nUsuário disse: " + msgProcessada;

                    process.stdout.write("\x1b[33mGemini:\x1b[0m Pensando...");
                    
                    const result = await smartGenerate(chatHistory, promptFinal, true);

                    readline.cursorTo(process.stdout, 0);
                    readline.clearLine(process.stdout, 0);
                    console.log(`\x1b[33mGemini:\x1b[0m ${result.text}\n`);

                    chatHistory.push({ role: "user", parts: [{ text: promptFinal }] });
                    chatHistory.push({ role: "model", parts: [{ text: result.text }] });

                    const sugestoes = extrairSugestoesArquivos(result.text);
                    await confirmarESalvarArquivos(sugestoes, rl);
                    await executarComandoSugerido(result.text, rl);

                } catch (error) {
                    console.error(`\n\x1b[31mErro:\x1b[0m ${error.message}\n`);
                }
                ask();
            });
        }
        ask();
    }
}

init();