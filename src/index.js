#!/usr/bin/env node

// #region 1. Imports e Configurações Iniciais
// =============================================================================
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv'; 
import { GoogleGenerativeAI } from "@google/generative-ai";
import readline from "readline";
import fs from "fs"; 
import os from 'os';

import { 
    gerarContexto, 
    gerarPromptCommit, 
    gerarPromptAuditoria 
} from "./utils/prompts.js"; 

import { 
  injetarArquivos, 
  extrairSugestoesArquivos, 
  confirmarESalvarArquivos, 
  executarComandoSugerido,
  lerGitDiff,
  realizarCommit,
  carregarImagem
} from "./utils/tools.js"; 

// --- CONFIGURAÇÃO GLOBAL DE ENV ---
const envPath = path.join(os.homedir(), '.gemini.env');
const result = dotenv.config({ path: envPath });

const API_KEY = process.env.GEMINI_API_KEY;

if (result.error || !API_KEY) { 
    console.error(`\n\x1b[31m[ERRO CRÍTICO] Configuração não encontrada.\x1b[0m`);
    console.error(`O sistema buscou o arquivo de configuração em: \x1b[33m${envPath}\x1b[0m`);
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

async function smartGenerate(history, newMessage, isChatMode) {
    let lastError = null;
    for (const modelName of MODEL_OPTIONS) {
        try {
            if (modelName !== MODEL_OPTIONS[0]) process.stdout.write(`\x1b[90m(${modelName}...)\x1b[0m `);
            
            const model = genAI.getGenerativeModel({ model: modelName });
            let responseText = "";

            if (isChatMode) {
                const chat = model.startChat({ history: history });
                const result = await chat.sendMessage(newMessage); // Suporta texto ou array [texto, imagem]
                responseText = (await result.response).text();
            } else {
                const result = await model.generateContent(newMessage);
                responseText = (await result.response).text();
            }
            return { text: responseText, usedModel: modelName };
        } catch (error) {
            lastError = error;
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

    // ==================================================
    // MODO A: AUTO-COMMIT (COM SECURITY GATE)
    // ==================================================
    if (args.includes('commit')) {
        
        // 1. Detecta Work Item (gemini commit work 123)
        let workTaskId = null;
        const workIndex = args.indexOf('work');
        if (workIndex !== -1 && args[workIndex + 1]) {
            workTaskId = args[workIndex + 1];
            console.log(`\x1b[35m[WORK MODE] Tarefa detectada: AB#${workTaskId}\x1b[0m`);
        }

        console.log(`\x1b[34m[GIT] Lendo alterações (staged)...\x1b[0m`);
        const diff = lerGitDiff();

        if (diff === null) {
            console.error("\x1b[31mErro: Git não encontrado.\x1b[0m");
            process.exit(1);
        }

        if (diff.trim().length === 0) {
            console.warn("\x1b[33mAviso: Nada em stage.\x1b[0m Dica: git add .");
            process.exit(0);
        }

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

        // === 2. AUDITORIA DE SEGURANÇA ===
        process.stdout.write("\x1b[33mGemini Security:\x1b[0m Auditando código");
        
        try {
            const promptSecurity = gerarPromptAuditoria(diff);
            const securityResult = await smartGenerate([], promptSecurity, false);
            const analise = securityResult.text.trim();
            
            readline.cursorTo(process.stdout, 0);
            readline.clearLine(process.stdout, 0);

            // Gate: Se não aprovar explicitamente, bloqueia.
            if (!analise.includes("[APROVADO]")) {
                console.log(`\n\x1b[41m\x1b[37m 🚨 BLOQUEIO DE SEGURANÇA 🚨 \x1b[0m`);
                console.log(`\x1b[31m${analise.replace("[ALERTA]", "").trim()}\x1b[0m`);
                console.log("\n---------------------------------------------------");
                
                await new Promise((resolve) => {
                    rl.question("\x1b[33mDeseja IGNORAR o alerta e prosseguir? (s/n): \x1b[0m", (resp) => {
                        if (resp.toLowerCase() !== 's') {
                            console.log("\x1b[90mCancelado por segurança.\x1b[0m");
                            process.exit(1); 
                        }
                        resolve();
                    });
                });
            } else {
                console.log(`\x1b[32m✔ Código Seguro\x1b[0m`);
            }
        } catch (err) {
            console.error("\nErro na auditoria:", err.message);
        }

        // === 3. GERAÇÃO DO COMMIT ===
        try {
            const promptCommit = gerarPromptCommit(diff, workTaskId);
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

    // ==================================================
    // MODO B: PIPE (Análise de Logs)
    // ==================================================
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

    // ==================================================
    // MODO C: INTERATIVO (Chat + Vision)
    // ==================================================
    
    // 1. Verifica imagem nos argumentos (--img foto.png)
    const imgFlagIndex = args.indexOf('--img');
    let imagemInicial = null;

    if (imgFlagIndex !== -1 && args[imgFlagIndex + 1]) {
        const caminhoImg = args[imgFlagIndex + 1];
        imagemInicial = carregarImagem(caminhoImg);
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    
    let chatHistory = [
        { role: "user", parts: [{ text: getContextoAtual() }] },
        { role: "model", parts: [{ text: "Pronto." }] }
    ];

    console.log(`\n--- Gemini CLI (Agente v2.0 + Vision 👁️) ---`);
    if (imagemInicial) console.log(`\x1b[35mImagem anexada ao contexto.\x1b[0m`);

    function ask() {
        rl.question("\x1b[36mVocê:\x1b[0m ", async (msg) => {
            if (msg.toLowerCase() === "sair") { rl.close(); return; }
            
            const contextoAtual = `Contexto: ${process.cwd()}`;
            
            try {
                const msgProcessada = injetarArquivos(msg);
                
                // Monta mensagem (Texto ou Texto+Imagem)
                let conteudoMensagem;
                if (imagemInicial) {
                     conteudoMensagem = [
                        { text: contextoAtual + "\n\nUser: " + msgProcessada },
                        imagemInicial
                     ];
                     imagemInicial = null; // Limpa para não reenviar
                } else {
                    conteudoMensagem = contextoAtual + "\n\nUser: " + msgProcessada;
                }

                process.stdout.write("\x1b[33mGemini:\x1b[0m Pensando...");
                const result = await smartGenerate(chatHistory, conteudoMensagem, true);

                readline.cursorTo(process.stdout, 0);
                readline.clearLine(process.stdout, 0);
                console.log(`\x1b[33mGemini:\x1b[0m ${result.text}\n`);

                chatHistory.push({ role: "user", parts: [{ text: msgProcessada }] });
                chatHistory.push({ role: "model", parts: [{ text: result.text }] });

                const sugestoes = extrairSugestoesArquivos(result.text);
                await confirmarESalvarArquivos(sugestoes, rl);
                await executarComandoSugerido(result.text, rl);

            } catch (error) { console.error(error.message); }
            ask();
        });
    }

    // Auto-disparo se houver pergunta na linha de comando junto com imagem
    // Ex: gemini "O que é isso?" --img foto.png
    const perguntaInicial = args.filter((arg, index) => !arg.startsWith('--') && index !== imgFlagIndex && index !== imgFlagIndex + 1).join(' ');
    
    if (perguntaInicial && imagemInicial) {
        rl.write(perguntaInicial + "\n");
    } else {
        ask();
    }
}

init();

// #endregion