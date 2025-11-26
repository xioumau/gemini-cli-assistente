import { exec, execSync } from "child_process";
import fs from "fs";
import path from "path";

// #region 1. Configuração e Helpers Internos
// =============================================================================

// Pastas que o buscador DEVE ignorar para não travar seu PC
const IGNORE_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage']);

/**
 * Função "Cão Farejador" (Recursiva)
 * Procura um arquivo em todas as subpastas permitidas.
 */
function findFileRecursively(dir, filename) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
        return null; 
    }

    // 1. Procura na raiz atual
    for (const entry of entries) {
        if (entry.isFile() && entry.name === filename) {
            return path.join(dir, entry.name);
        }
    }

    // 2. Mergulha nas subpastas
    for (const entry of entries) {
        if (entry.isDirectory() && !IGNORE_DIRS.has(entry.name)) {
            const found = findFileRecursively(path.join(dir, entry.name), filename);
            if (found) return found;
        }
    }

    return null;
}

// #endregion

// #region 2. Processamento de Texto e Leitura (@arquivo)
// =============================================================================

/**
 * Substitui @nome_do_arquivo pelo conteúdo real do arquivo encontrado.
 */
export function injetarArquivos(mensagemUsuario) {
  const regexArquivo = /@([\w\d\.\-\_]+)/g;
  
  return mensagemUsuario.replace(regexArquivo, (match, nomeArquivo) => {
    const fullPath = findFileRecursively(process.cwd(), nomeArquivo);

    if (fullPath) {
        try {
            const conteudo = fs.readFileSync(fullPath, 'utf8');
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

/**
 * Extrai blocos ###ARQUIVO da resposta da IA.
 */
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

// #endregion

// #region 3. Operações de Escrita em Disco
// =============================================================================

/**
 * Pergunta ao usuário se pode salvar os arquivos extraídos.
 */
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

// #endregion

// #region 4. Execução de Comandos de Sistema (###CMD)
// =============================================================================

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
                
                // Tratamento especial para navegação virtual (cd)
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

// #endregion

// #region 5. Operações Git (Auto-Commit)
// =============================================================================

export function lerGitDiff() {
    try {
        // --cached = staged area
        const diff = execSync("git diff --cached", { encoding: 'utf8' });
        return diff;
    } catch (error) {
        return null;
    }
}

export async function realizarCommit(mensagem, rl) {
    console.log(`\n\x1b[36m[SUGESTÃO DE COMMIT]\x1b[0m`);
    console.log(`\x1b[1m${mensagem}\x1b[0m`);
    
    return new Promise((resolve) => {
        rl.question("\n\x1b[35mConfirmar commit? (s/n): \x1b[0m", (resp) => {
            if (resp.toLowerCase() === 's') {
                // Escapa aspas para não quebrar o bash
                const msgSegura = mensagem.replace(/"/g, '\\"');
                
                exec(`git commit -m "${msgSegura}"`, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`\x1b[31mErro ao commitar:\x1b[0m ${error.message}`);
                    } else {
                        console.log(`\x1b[32m✔ Commit realizado com sucesso!\x1b[0m`);
                        console.log(stdout);
                    }
                    resolve(true);
                });
            } else {
                console.log("\x1b[90mCommit cancelado.\x1b[0m");
                resolve(false);
            }
        });
    });
}

// #endregion

// #region 6. Multimodal (Imagens)
// =============================================================================

export function carregarImagem(caminhoImagem) {
    try {
        // Resolve o caminho
        const caminhoCompleto = path.resolve(process.cwd(), caminhoImagem);
        
        // 1. Validação de Existência
        if (!fs.existsSync(caminhoCompleto)) {
            console.error(`\x1b[31m[ERRO] Imagem não encontrada: ${caminhoCompleto}\x1b[0m`);
            return null;
        }

        // 2. Validação de Segurança (Path Traversal / Tipo de Arquivo)
        const ext = path.extname(caminhoCompleto).toLowerCase();
        const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.heic'];
        
        if (!allowedExtensions.includes(ext)) {
            console.error(`\x1b[31m[ERRO DE SEGURANÇA] Tipo de arquivo não permitido: ${ext}\x1b[0m`);
            console.error(`Permitidos: ${allowedExtensions.join(', ')}`);
            return null;
        }

        // 3. Validação de DoS (Tamanho do Arquivo)
        const stats = fs.statSync(caminhoCompleto);
        const MAX_SIZE_MB = 10;
        const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

        if (stats.size > MAX_SIZE_BYTES) {
            console.error(`\x1b[31m[ERRO] Imagem muito grande (${(stats.size / 1024 / 1024).toFixed(2)}MB).\x1b[0m`);
            console.error(`O limite de segurança é ${MAX_SIZE_MB}MB.`);
            return null;
        }

        // Se passou por tudo, lê o arquivo
        const dadosArquivo = fs.readFileSync(caminhoCompleto);
        const base64Data = dadosArquivo.toString('base64');
        
        let mimeType = 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        if (ext === '.webp') mimeType = 'image/webp';
        if (ext === '.heic') mimeType = 'image/heic';

        console.log(`\x1b[35m[VISÃO] Imagem carregada: ${path.basename(caminhoCompleto)}\x1b[0m`);

        return {
            inlineData: {
                data: base64Data,
                mimeType: mimeType
            }
        };

    } catch (error) {
        console.error(`Erro ao processar imagem: ${error.message}`);
        return null;
    }
}

// #endregion