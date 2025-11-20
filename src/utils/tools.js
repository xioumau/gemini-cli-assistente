import { exec } from "child_process";
import fs from "fs";
import path from "path";

// --- CONFIGURAÇÃO DE BUSCA ---
// Pastas que o buscador DEVE ignorar para não travar seu PC
const IGNORE_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage']);

// --- FUNÇÃO "CÃO FAREJADOR" (RECURSIVA) ---
function findFileRecursively(dir, filename) {
    let entries;
    try {
        // Lê o conteúdo da pasta atual com tipos (para saber o que é pasta ou arquivo)
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
        return null; // Se não tiver permissão de leitura, ignora
    }

    // 1. Primeiro, procura na raiz da pasta atual (Prioridade para arquivos rasos)
    for (const entry of entries) {
        if (entry.isFile() && entry.name === filename) {
            return path.join(dir, entry.name);
        }
    }

    // 2. Se não achou, mergulha nas subpastas permitidas
    for (const entry of entries) {
        if (entry.isDirectory() && !IGNORE_DIRS.has(entry.name)) {
            const found = findFileRecursively(path.join(dir, entry.name), filename);
            if (found) return found; // Se achou lá no fundo, retorna e para a busca
        }
    }

    return null; // Não achou em lugar nenhum desta árvore
}

// 1. Leitura de Arquivos (@arquivo)
export function injetarArquivos(mensagemUsuario) {
  const regexArquivo = /@([\w\d\.\-\_]+)/g;
  
  return mensagemUsuario.replace(regexArquivo, (match, nomeArquivo) => {
    
    // Usa a nova busca inteligente a partir da pasta onde você rodou o comando
    const fullPath = findFileRecursively(process.cwd(), nomeArquivo);

    if (fullPath) {
        try {
            const conteudo = fs.readFileSync(fullPath, 'utf8');
            // Mostra o caminho relativo para você saber qual arquivo exato ele pegou
            const caminhoRelativo = path.relative(process.cwd(), fullPath);
            
            console.log(`\x1b[90m[Sistema] Encontrado: ${caminhoRelativo}...\x1b[0m`);
            return `\n--- INÍCIO ARQUIVO: ${caminhoRelativo} ---\n${conteudo}\n--- FIM ARQUIVO ---\n`;
        } catch (err) {
             return `(ERRO FATAL: Leitura de ${nomeArquivo} falhou: ${err.message})`;
        }
    } else {
      return `(ERRO: O arquivo ${nomeArquivo} não foi encontrado em nenhuma subpasta do projeto)`;
    }
  });
}

// ... (O RESTO DO ARQUIVO CONTINUA IGUAL: extrairSugestoesArquivos, confirmarESalvarArquivos, etc) ...
// Mantenha as outras funções export extrairSugestoesArquivos, confirmarESalvarArquivos e executarComandoSugerido exatamente como estavam.
export function extrairSugestoesArquivos(texto) {
    const regex = /###ARQUIVO:[ \t]*([^\r\n]+)[\r\n]+([\s\S]*?)###FIM_ARQUIVO/gi;
    let match;
    let sugestoes = [];

    while ((match = regex.exec(texto)) !== null) {
        let nomeArquivo = match[1].trim().replace(/['"`]/g, ''); 
        let conteudo = match[2].replace(/^\n/, '');
        
        if (nomeArquivo && nomeArquivo.length > 0) {
            sugestoes.push({ nome: nomeArquivo, conteudo: conteudo });
        }
    }
    return sugestoes;
}

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