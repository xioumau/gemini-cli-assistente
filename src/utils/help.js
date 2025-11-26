/**
 * Exibe o manual de uso da CLI com formatação colorida e encerra o processo.
 */
export function exibirHelp() {
    console.log(`
\x1b[36m🤖 Gemini CLI Assistant - Manual de Uso\x1b[0m

\x1b[33mMODOS DE EXECUÇÃO:\x1b[0m
  1. \x1b[1mInterativo:\x1b[0m   Digite apenas \x1b[32mgemini\x1b[0m para entrar no chat.
  2. \x1b[1mAuto-Commit:\x1b[0m  Digite \x1b[32mgemini commit\x1b[0m
     \x1b[90m-> Lê o 'git diff', faz auditoria de segurança (SAST) e sugere mensagem.\x1b[0m
  3. \x1b[1mWork Item:\x1b[0m    Digite \x1b[32mgemini commit work 12345\x1b[0m
     \x1b[90m-> Adiciona o prefixo AB#12345 no commit.\x1b[0m
  4. \x1b[1mPipe (Logs):\x1b[0m  Use \x1b[32mcat erro.log | gemini\x1b[0m ou \x1b[32mgit diff | gemini\x1b[0m
     \x1b[90m-> Envia a saída do comando anterior para análise imediata da IA.\x1b[0m

\x1b[33mRECURSOS NO CHAT:\x1b[0m
  • \x1b[36m@arquivo\x1b[0m      Lê o conteúdo de um arquivo (busca recursiva inteligente).
                    Ex: "Explique o código do \x1b[1m@index.js\x1b[0m"
  
  • \x1b[36m--img\x1b[0m         Anexa uma imagem ao contexto inicial (Visão Computacional).
                    Ex: \x1b[32mgemini "Arrume este CSS" --img print.png\x1b[0m

\x1b[33mSEGURANÇA:\x1b[0m
  • \x1b[31mAuditoria:\x1b[0m    O modo commit verifica automaticamente segredos e vulnerabilidades.
  • \x1b[32mConfig:\x1b[0m       As chaves ficam salvas em \x1b[1m.gemini.env\x1b[0m na sua pasta de usuário.

\x1b[90mVersão 2.2 | Alta Disponibilidade Ativa (Flash/Pro)\x1b[0m
`);
    process.exit(0);
}