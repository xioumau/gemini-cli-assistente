import { exec, execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";

// #region 1. Configuração e Helpers Internos
// =============================================================================

// Adicionado: bin, obj, .vs (Padrão C#/.NET) e .idea (Padrão JetBrains/VSCode)
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  "bin",
  "obj",
  ".vs",
  ".idea",
  ".vscode",
]);

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
        const conteudo = fs.readFileSync(fullPath, "utf8");
        const caminhoRelativo = path.relative(process.cwd(), fullPath);

        // Evita injetar arquivos binários/gigantes inadvertidamente
        if (conteudo.length > 500000)
          return `(ERRO: O arquivo ${nomeArquivo} é muito grande para o contexto)`;
        if (conteudo.includes("\0"))
          return `(ERRO: O arquivo ${nomeArquivo} parece ser binário)`;

        console.log(
          `\x1b[90m[Sistema] Encontrado: ${caminhoRelativo}...\x1b[0m`
        );
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
 * (Melhorado para limpar Markdown artifacts como ```javascript ...)
 */
export function extrairSugestoesArquivos(texto) {
  // Regex flexível: Aceita espaços extras e quebras de linha variadas
  const regex = /###ARQUIVO:[ \t]*([^\r\n]+)[\r\n]+([\s\S]*?)###FIM_ARQUIVO/gi;
  let match;
  let sugestoes = [];

  while ((match = regex.exec(texto)) !== null) {
    let nomeArquivo = match[1].trim().replace(/['"`]/g, "");
    let conteudo = match[2];

    // LIMPEZA DE MARKDOWN (Sanitization)
    // Remove linhas iniciais como ```javascript ou ```csharp
    conteudo = conteudo.replace(/^```[\w-]*\r?\n/i, "");
    // Remove linha final ```
    conteudo = conteudo.replace(/```\s*$/i, "");
    // Remove newline inicial sobrando
    conteudo = conteudo.replace(/^\n/, "");

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

  console.log(
    `\n\x1b[36m[PROPOSTA DE ARQUIVOS] O Gemini quer criar/editar:\x1b[0m`
  );
  sugestoes.forEach((s) => console.log(` 📄 ${s.nome}`));

  return new Promise((resolve) => {
    rl.question(
      "\n\x1b[36mDeseja aplicar essas alterações nos arquivos? (s/n):\x1b[0m ",
      (resp) => {
        if (resp.toLowerCase() === "s") {
          sugestoes.forEach((item) => {
            try {
              const caminho = path.join(process.cwd(), item.nome);
              fs.mkdirSync(path.dirname(caminho), { recursive: true });
              fs.writeFileSync(caminho, item.conteudo, "utf8");
              console.log(` \x1b[32m✔ Salvo: ${item.nome}\x1b[0m`);
            } catch (err) {
              console.error(
                ` \x1b[31m✖ Erro em ${item.nome}: ${err.message}\x1b[0m`
              );
            }
          });
        } else {
          console.log(" \x1b[90mAlterações de arquivos canceladas.\x1b[0m");
        }
        resolve();
      }
    );
  });
}

// #endregion

// #region 4. Execução de Comandos de Sistema (###CMD)
// =============================================================================

/**
 * Executa comandos sugeridos pela IA com detecção de comandos críticos.
 */
export async function executarComandoSugerido(texto, rl) {
  const regex = /###CMD:\s*([^\r\n]+)[\r\n]+([\s\S]*?)###FIM_CMD/gi;
  let match = regex.exec(texto);

  if (!match) return;

  const comando = match[1].trim();
  const explicacao = match[2].trim();

  // --- DETECTOR DE COMANDOS CRÍTICOS ---
  const keywordsCriticas = [
    "rm",
    "del",
    "remove",
    "erase",
    "rd",
    "rmdir", // Deleção
    "mv",
    "move",
    "rename", // Movimentação
    ">",
    "truncate",
    "format",
    "dd", // Sobrescrita/Destrutivos
  ];

  // Verifica se o comando contém alguma das palavras perigosas
  const ehCritico = keywordsCriticas.some((k) => {
    // Usa regex para garantir que pegamos a palavra inteira (evita 'move' em 'movement')
    const regexK = new RegExp(`\\b${k}\\b`, "i");
    return regexK.test(comando) || comando.includes(">");
  });

  console.log(`\n\x1b[35m[PROPOSTA DE COMANDO] Terminal:\x1b[0m`);
  console.log(`\x1b[1m> ${comando}\x1b[0m`);
  if (explicacao) console.log(`ℹ️  ${explicacao}`);

  // Alerta Visual se for crítico
  if (ehCritico) {
    console.log(
      `\n\x1b[41m\x1b[37m ⚠️  PERIGO: COMANDO CRÍTICO DETECTADO ⚠️ \x1b[0m`
    );
    console.log(
      `\x1b[31mEste comando pode EXCLUIR, MOVER ou SOBRESCREVER arquivos permanentemente.\x1b[0m`
    );
  }

  return new Promise((resolve) => {
    rl.question(
      "\n\x1b[35mDeseja executar este comando? (s/n):\x1b[0m ",
      (resp) => {
        if (resp.toLowerCase() === "s") {
          console.log("\n\x1b[90mExecutando...\x1b[0m\n");

          if (comando.startsWith("cd ")) {
            try {
              const novaPasta = comando.replace("cd ", "").trim();
              process.chdir(novaPasta);
              console.log(
                `\x1b[32m✔ Diretório alterado para: ${process.cwd()}\x1b[0m`
              );
              resolve("Diretório alterado");
            } catch (err) {
              console.error(
                `\x1b[31mErro ao mudar diretório: ${err.message}\x1b[0m`
              );
              resolve(null);
            }
            return;
          }

          // Mantemos o shell: true para flexibilidade, mas com sua revisão humana
          const processo = spawn(comando, { shell: true });
          let fullOutput = "";

          processo.stdout.on("data", (data) => {
            const str = data.toString();
            fullOutput += str;
            process.stdout.write(str);
          });

          processo.stderr.on("data", (data) => {
            process.stdout.write(`\x1b[33m${data}\x1b[0m`);
          });

          processo.on("close", (code) => {
            if (code === 0) {
              console.log(`\n\x1b[32m✔ Comando finalizado.\x1b[0m`);
            } else {
              console.error(
                `\n\x1b[31m✖ Comando encerrou com erro (Código: ${code})\x1b[0m`
              );
            }
            resolve(fullOutput);
          });
        } else {
          console.log(" \x1b[90mComando cancelado.\x1b[0m");
          resolve(null);
        }
      }
    );
  });
}

// #endregion

// #region 5. Operações Git (Auto-Commit)
// =============================================================================

/**
 * Lê as alterações que estão no "Staged Area" (git add).
 */
export function lerGitDiff() {
  try {
    // --cached = staged area
    const diff = execSync("git diff --cached", { encoding: "utf8" });
    return diff;
  } catch (error) {
    return null;
  }
}

/**
 * Realiza o commit permitindo confirmação, cancelamento ou edição manual.
 */
export async function realizarCommit(mensagem, rl) {
  let mensagemAtual = mensagem.trim();

  const menuCommit = () => {
    return new Promise((resolve) => {
      console.log(`\n\x1b[36m[SUGESTÃO DE COMMIT]\x1b[0m`);
      console.log(`\x1b[1m${mensagemAtual}\x1b[0m`);

      rl.question(
        "\n\x1b[35mDeseja: [s] Confirmar / [n] Cancelar / [e] Editar? \x1b[0m",
        (resp) => {
          const escolha = resp.toLowerCase();

          if (escolha === "s") {
            console.log("\x1b[90mCommitando...\x1b[0m");

            // --- SOLUÇÃO SEGURA: Usar spawn em vez de exec ---
            // Passamos os argumentos como um ARRAY.
            // O Shell não interpreta caracteres especiais dentro do array.
            const gitProcess = spawn("git", ["commit", "-m", mensagemAtual]);

            gitProcess.stdout.on("data", (data) =>
              console.log(`\x1b[32m${data}\x1b[0m`)
            );
            gitProcess.stderr.on("data", (data) =>
              console.error(`\x1b[31m${data}\x1b[0m`)
            );

            gitProcess.on("close", (code) => {
              if (code === 0) {
                console.log(`\x1b[32m✔ Commit realizado com sucesso!\x1b[0m`);
                resolve(true);
              } else {
                console.error(
                  `\x1b[31m✖ Erro ao commitar (Código: ${code})\x1b[0m`
                );
                resolve(false);
              }
            });
          } else if (escolha === "e") {
            rl.question(
              "\n\x1b[36mDigite a nova mensagem de commit:\x1b[0m\n> ",
              (novaMsg) => {
                if (novaMsg.trim().length > 0) {
                  mensagemAtual = novaMsg.trim();
                }
                resolve(menuCommit());
              }
            );
          } else {
            console.log("\x1b[90mCommit cancelado.\x1b[0m");
            resolve(false);
          }
        }
      );
    });
  };

  return menuCommit();
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
      console.error(
        `\x1b[31m[ERRO] Imagem não encontrada: ${caminhoCompleto}\x1b[0m`
      );
      return null;
    }

    // 2. Validação de Segurança (Path Traversal / Tipo de Arquivo)
    const ext = path.extname(caminhoCompleto).toLowerCase();
    const allowedExtensions = [".png", ".jpg", ".jpeg", ".webp", ".heic"];

    if (!allowedExtensions.includes(ext)) {
      console.error(
        `\x1b[31m[ERRO DE SEGURANÇA] Tipo de arquivo não permitido: ${ext}\x1b[0m`
      );
      console.error(`Permitidos: ${allowedExtensions.join(", ")}`);
      return null;
    }

    // 3. Validação de DoS (Tamanho do Arquivo)
    const stats = fs.statSync(caminhoCompleto);
    const MAX_SIZE_MB = 10;
    const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

    if (stats.size > MAX_SIZE_BYTES) {
      console.error(
        `\x1b[31m[ERRO] Imagem muito grande (${(
          stats.size /
          1024 /
          1024
        ).toFixed(2)}MB).\x1b[0m`
      );
      console.error(`O limite de segurança é ${MAX_SIZE_MB}MB.`);
      return null;
    }

    // Se passou por tudo, lê o arquivo
    const dadosArquivo = fs.readFileSync(caminhoCompleto);
    const base64Data = dadosArquivo.toString("base64");

    let mimeType = "image/png";
    if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
    if (ext === ".webp") mimeType = "image/webp";
    if (ext === ".heic") mimeType = "image/heic";

    console.log(
      `\x1b[35m[VISÃO] Imagem carregada: ${path.basename(
        caminhoCompleto
      )}\x1b[0m`
    );

    return {
      inlineData: {
        data: base64Data,
        mimeType: mimeType,
      },
    };
  } catch (error) {
    console.error(`Erro ao processar imagem: ${error.message}`);
    return null;
  }
}

// #endregion
