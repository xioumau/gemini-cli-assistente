#!/usr/bin/env node

// #region 1. Imports e Configurações Iniciais
// =============================================================================
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv'; // Importamos a lib (sem /config) para configurar manualmente
import { GoogleGenerativeAI } from "@google/generative-ai";
import readline from "readline";
import fs from "fs"; 

import { gerarContexto, gerarPromptCommit } from "./utils/prompts.js"; 
import { 
  injetarArquivos, 
  extrairSugestoesArquivos, 
  confirmarESalvarArquivos, 
  executarComandoSugerido,
  lerGitDiff,
  realizarCommit
} from "./utils/tools.js"; 

// --- CONFIGURAÇÃO DE CAMINHO DO .ENV ---
// 1. Descobre onde este arquivo (index.js) está guardado fisicamente
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. Calcula o caminho do .env (que está uma pasta acima de /src)
const envPath = path.resolve(__dirname, '..', '.env');

// 3. Força o dotenv a ler aquele arquivo específico, não importa onde você esteja rodando
const result = dotenv.config({ path: envPath });

const API_KEY = process.env.GEMINI_API_KEY;

if (result.error || !API_KEY) { 
    console.error(`\n\x1b[31m[ERRO CRÍTICO] Não foi possível carregar a API Key.\x1b[0m`);
    console.error(`O sistema buscou o arquivo .env em: \x1b[33m${envPath}\x1b[0m`);
    console.error("Verifique se o arquivo existe e tem a chave GEMINI_API_KEY configurada.");
    process.exit(1); 
}

const genAI = new GoogleGenerativeAI(API_KEY);

// Lista de prioridade para Alta Disponibilidade
const MODEL_OPTIONS = [
    "gemini-2.5-flash", 
    "gemini-2.5-pro", 
    "gemini-2.0-flash-001", 
    "gemini-pro-latest"
];

// #endregion

// #region 2. Lógica da IA (Smart Generate + Fallback)
// =============================================================================

/**
 * Tenta gerar conteúdo usando múltiplos modelos em caso de erro 503.
 */
async function smartGenerate(history, newMessage, isChatMode) {
    let lastError = null;
    for (const modelName of MODEL_OPTIONS) {
        try {
            // Feedback visual discreto se não for o modelo principal
            if (modelName !== MODEL_OPTIONS[0]) process.stdout.write(`\x1b[90m(${modelName}...)\x1b[0m `);
            
            const model = genAI.getGenerativeModel({ model: modelName });
            let responseText = "";

            if (isChatMode) {
                const chat = model.startChat({ history: history });
                const result = await chat.sendMessage(newMessage);
                responseText = (await result.response).text();
            } else {
                const result = await model.generateContent(newMessage);
                responseText = (await result.response).text();
            }
            return { text: responseText, usedModel: modelName };
        } catch (error) {
            lastError = error;
            // Se for erro de sobrecarga, tenta o próximo da lista
            if (error.message.includes("503") || error.message.includes("overloaded")) continue;
            else throw error;
        }
    }
    throw new Error(`Falha nos modelos: ${lastError.message}`);
}

// #endregion

// #region 3. Funções Auxiliares (IO e Contexto)
// =============================================================================

function getContextoAtual() {
    const dir = process.cwd();
    let files = "";
    try { files = fs.readdirSync(dir).join(", "); } catch (e) { files = "Erro"; }
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

// #endregion

// #region 4. Inicialização e Modos de Execução
// =============================================================================

async function init() {
    const args = process.argv.slice(2);

    // --- MODO A: AUTO-COMMIT ---
    if (args.includes('commit')) {
        console.log(`\x1b[34m[GIT] Analisando alterações (staged)...\x1b[0m`);
        
        const diff = lerGitDiff();

        if (diff === null) {
            console.error("\x1b[31mErro: Git não encontrado ou não iniciado.\x1b[0m");
            process.exit(1);
        }

        if (diff.trim().length === 0) {
            console.warn("\x1b[33mAviso: Nenhuma alteração em stage (staged).\x1b[0m");
            console.log("Dica: Use 'git add .' antes.");
            process.exit(0);
        }

        const promptCommit = gerarPromptCommit(diff);
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

        try {
            process.stdout.write("\x1b[33mGemini:\x1b[0m Gerando mensagem...");
            const result = await smartGenerate([], promptCommit, false);
            
            readline.cursorTo(process.stdout, 0);
            readline.clearLine(process.stdout, 0);

            await realizarCommit(result.text.trim(), rl);
        } catch (error) {
            console.error(`\nErro: ${error.message}`);
        }
        
        rl.close();
        process.exit(0);
        return;
    }

    // --- MODO B: PIPE (Análise de Logs) ---
    if (!process.stdin.isTTY) {
        console.log(`\x1b[34m[SISTEMA] Lendo Pipe...\x1b[0m`);
        const pipedData = await readStdin();
        if (!pipedData.trim()) { process.exit(1); }

        const prompt = `${getContextoAtual()}\n\n=== DADOS ===\n${pipedData}\nInstrução: Analise.`;
        try {
            process.stdout.write("\x1b[33mGemini:\x1b[0m Analisando...");
            const res = await smartGenerate([], prompt, false);
            
            readline.cursorTo(process.stdout, 0);
            readline.clearLine(process.stdout, 0);
            console.log(res.text.trim());
        } catch(e) { console.error(e.message); }
        process.exit(0);
        return;
    }

    // --- MODO C: INTERATIVO (Chat) ---
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let chatHistory = [
        { role: "user", parts: [{ text: getContextoAtual() }] },
        { role: "model", parts: [{ text: "Pronto." }] }
    ];

    console.log(`\n--- Gemini CLI (Agente v2.0) ---`);
    console.log(`Dica: Use 'gemini commit' para autocommit.\n`);

    function ask() {
        rl.question("\x1b[36mVocê:\x1b[0m ", async (msg) => {
            if (msg.toLowerCase() === "sair") { rl.close(); return; }
            
            const contextoAtual = `Contexto: ${process.cwd()}`;
            
            try {
                const msgProcessada = injetarArquivos(msg);
                const promptFinal = contextoAtual + "\n\nUser: " + msgProcessada;

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

            } catch (error) { console.error(error.message); }
            ask();
        });
    }
    ask();
}

init();

// #endregion