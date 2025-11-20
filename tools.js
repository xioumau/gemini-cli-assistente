// tools.js
import fs from "fs";
import path from "path";
import { exec } from "child_process";

// Função para ler arquivos solicitados com @
export function injetarArquivos(mensagemUsuario) {
  const regexArquivo = /@([\w\d\.\-\_]+)/g;
  
  return mensagemUsuario.replace(regexArquivo, (match, nomeArquivo) => {
    try {
      const caminho = path.join(process.cwd(), nomeArquivo);
      if (fs.existsSync(caminho)) {
        const conteudo = fs.readFileSync(caminho, 'utf8');
        // Retorna o conteúdo formatado
        return `\n--- INÍCIO DO ARQUIVO: ${nomeArquivo} ---\n${conteudo}\n--- FIM DO ARQUIVO ---\n`;
      } else {
        return `(ERRO: O usuário tentou ler o arquivo ${nomeArquivo}, mas ele não existe)`;
      }
    } catch (err) {
      return `(ERRO ao ler ${nomeArquivo}: ${err.message})`;
    }
  });
}

// Função para processar arquivos criados pelo Gemini
export function processarArquivosCriados(texto) {
  const regex = /###ARQUIVO:\s*([^\r\n]+)[\r\n]+([\s\S]*?)###FIM_ARQUIVO/gi;
  let match;
  let arquivosCriados = [];

  while ((match = regex.exec(texto)) !== null) {
    let nomeArquivo = match[1].trim().replace(/['"`]/g, ''); 
    let conteudo = match[2].replace(/^\n/, ''); 

    if (!nomeArquivo) continue;

    try {
      const caminhoCompleto = path.join(process.cwd(), nomeArquivo);
      fs.writeFileSync(caminhoCompleto, conteudo, 'utf8');
      arquivosCriados.push(nomeArquivo);
    } catch (erro) {
      console.error(`Erro ao gravar ${nomeArquivo}: ${erro.message}`);
    }
  }
  return arquivosCriados;
}

// --- Executar Comandos ---
export async function executarComandoSugerido(texto, readlineInterface) {
  const regex = /###CMD:\s*([^\r\n]+)[\r\n]+([\s\S]*?)###FIM_CMD/gi;
  let match = regex.exec(texto);

  if (!match) return; // Nenhum comando encontrado

  const comando = match[1].trim();
  const explicacao = match[2].trim();

  console.log(`\n\x1b[35m[SISTEMA] A IA sugeriu executar:\x1b[0m`);
  console.log(`\x1b[1m> ${comando}\x1b[0m`);
  if(explicacao) console.log(`(${explicacao})`);

  // Perguntar confirmação (Segurança é vital!)
  return new Promise((resolve) => {
    readlineInterface.question("\n\x1b[35mDeseja executar? (s/n):\x1b[0m ", (resposta) => {
      if (resposta.toLowerCase() === 's') {
        console.log("\nExecutando...");
        
        exec(comando, (error, stdout, stderr) => {
          if (error) {
            console.error(`\x1b[31mErro:\x1b[0m ${error.message}`);
            resolve(null);
            return;
          }
          if (stderr) console.error(`\x1b[33mStderr:\x1b[0m ${stderr}`);
          
          console.log(`\x1b[32mSaída:\x1b[0m\n${stdout}`);
          resolve(stdout); // Retorna a saída para (futuramente) a IA ler
        });
      } else {
        console.log("Execução cancelada.");
        resolve(null);
      }
    });
  });
}