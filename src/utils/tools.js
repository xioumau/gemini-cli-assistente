import { exec } from "child_process";
import fs from "fs";
import path from "path";

// 1. Leitura de Arquivos (@arquivo)
export function injetarArquivos(mensagemUsuario) {
  const regexArquivo = /@([\w\d\.\-\_]+)/g;
  return mensagemUsuario.replace(regexArquivo, (match, nomeArquivo) => {
    try {
      const caminho = path.join(process.cwd(), nomeArquivo);
      if (fs.existsSync(caminho)) {
        const conteudo = fs.readFileSync(caminho, 'utf8');
        return `\n--- INÍCIO ARQUIVO: ${nomeArquivo} ---\n${conteudo}\n--- FIM ARQUIVO ---\n`;
      }
      return `(ERRO: Arquivo ${nomeArquivo} não encontrado)`;
    } catch (err) {
      return `(ERRO Leitura ${nomeArquivo}: ${err.message})`;
    }
  });
}

// 2. Extrair Propostas de Arquivos (Sem salvar ainda)
export function extrairSugestoesArquivos(texto) {
  const regex = /###ARQUIVO:\s*([^\r\n]+)[\r\n]+([\s\S]*?)###FIM_ARQUIVO/gi;
  let match;
  let sugestoes = [];

  while ((match = regex.exec(texto)) !== null) {
    let nomeArquivo = match[1].trim().replace(/['"`]/g, ''); 
    let conteudo = match[2].replace(/^\n/, ''); 
    if (nomeArquivo) {
      sugestoes.push({ nome: nomeArquivo, conteudo: conteudo });
    }
  }
  return sugestoes;
}

// 3. Confirmar e Salvar Arquivos
export async function confirmarESalvarArquivos(sugestoes, rl) {
  if (sugestoes.length === 0) return;

  console.log(`\n\x1b[36m[PROPOSTA DE ARQUIVOS] O Gemini quer criar/editar:\x1b[0m`);
  sugestoes.forEach(s => console.log(` 📄 ${s.nome}`));
  
  return new Promise((resolve) => {
    rl.question("\n\x1b[36mDeseja aplicar essas alterações nos arquivos? (s/n):\x1b[0m ", (resp) => {
      if (resp.toLowerCase() === 's') {
        sugestoes.forEach(item => {
          try {
            const caminho = path.join(process.cwd(), item.nome);
            // Cria pastas recursivamente se necessário (ex: src/components/Header.js)
            fs.mkdirSync(path.dirname(caminho), { recursive: true });
            fs.writeFileSync(caminho, item.conteudo, 'utf8');
            console.log(` \x1b[32m✔ Salvo: ${item.nome}\x1b[0m`);
          } catch (err) {
            console.error(` \x1b[31m✖ Erro em ${item.nome}: ${err.message}\x1b[0m`);
          }
        });
      } else {
        console.log(" \x1b[90mAlterações de arquivos canceladas.\x1b[0m");
      }
      resolve();
    });
  });
}

// 4. Executar Comandos (Terminal)
export async function executarComandoSugerido(texto, rl) {
  const regex = /###CMD:\s*([^\r\n]+)[\r\n]+([\s\S]*?)###FIM_CMD/gi;
  let match = regex.exec(texto);

  if (!match) return; 

  const comando = match[1].trim();
  const explicacao = match[2].trim();

  console.log(`\n\x1b[35m[PROPOSTA DE COMANDO] Terminal:\x1b[0m`);
  console.log(`\x1b[1m> ${comando}\x1b[0m`);
  if(explicacao) console.log(`ℹ️  ${explicacao}`);

  return new Promise((resolve) => {
    rl.question("\n\x1b[35mDeseja executar este comando? (s/n):\x1b[0m ", (resp) => {
      if (resp.toLowerCase() === 's') {
        console.log("\nExecutando...");
        // Lida com o comando "cd" de forma especial (navegação virtual)
        if (comando.startsWith("cd ")) {
            try {
                const novaPasta = comando.replace("cd ", "").trim();
                process.chdir(novaPasta);
                console.log(`\x1b[32m✔ Diretório alterado para: ${process.cwd()}\x1b[0m`);
            } catch (err) {
                console.error(`\x1b[31mErro ao mudar diretório: ${err.message}\x1b[0m`);
            }
            resolve("Diretório alterado via Node.js");
            return;
        }

        exec(comando, (error, stdout, stderr) => {
          if (error) {
            console.error(`\x1b[31mErro:\x1b[0m ${error.message}`);
          } else {
            if (stdout) console.log(`\x1b[32mSaída:\x1b[0m\n${stdout}`);
            if (stderr) console.log(`\x1b[33mAviso:\x1b[0m ${stderr}`);
          }
          resolve(stdout);
        });
      } else {
        console.log(" \x1b[90mComando cancelado.\x1b[0m");
        resolve(null);
      }
    });
  });
}