import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { injetarArquivos, extrairSugestoesArquivos } from '../src/utils/tools.js';

// Nome da pasta temporária para isolar os testes
const TEMP_DIR = 'temp_test_sandbox';

describe('Testes da Ferramenta de Leitura (Recursiva e Inteligente)', () => {

  // ANTES DE TUDO: Cria um ambiente de arquivos fake
  before(() => {
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);
    
    // 1. Arquivo na raiz do sandbox
    fs.writeFileSync(path.join(TEMP_DIR, 'raiz.txt'), 'Conteudo Raiz');
    
    // 2. Arquivo em subpasta (Testar recursividade)
    const subDir = path.join(TEMP_DIR, 'src', 'components');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, 'profundo.js'), 'console.log("Sou profundo");');

    // 3. Arquivo em pasta ignorada (Testar IGNORE_DIRS)
    const ignoreDir = path.join(TEMP_DIR, 'node_modules');
    fs.mkdirSync(ignoreDir, { recursive: true });
    fs.writeFileSync(path.join(ignoreDir, 'secreto.key'), 'Nao deveria ler isso');
  });

  // DEPOIS DE TUDO: Limpa a sujeira
  after(() => {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  });

  test('Deve encontrar arquivo na raiz da busca', () => {
    // Simulamos que estamos dentro da pasta TEMP_DIR para o teste
    const cwdOriginal = process.cwd();
    try {
      process.chdir(TEMP_DIR); // Muda o diretório de trabalho para o sandbox
      
      const entrada = 'Leia o @raiz.txt por favor';
      const resultado = injetarArquivos(entrada);
      
      assert.match(resultado, /Conteudo Raiz/);
      assert.match(resultado, /--- INÍCIO ARQUIVO: raiz.txt ---/);
    } finally {
      process.chdir(cwdOriginal); // Volta para a pasta original
    }
  });

  test('Deve encontrar arquivo em subpastas profundas (Recursividade)', () => {
    const cwdOriginal = process.cwd();
    try {
      process.chdir(TEMP_DIR);
      
      // Note que pedimos apenas o nome do arquivo, e ele deve achar lá no fundo
      const entrada = 'Analise o @profundo.js';
      const resultado = injetarArquivos(entrada);
      
      assert.match(resultado, /Sou profundo/);
      // Verifica se o caminho relativo foi montado corretamente (Windows ou Linux)
      // src/components/profundo.js ou src\components\profundo.js
      assert.match(resultado, /src[\\\/]components[\\\/]profundo.js/);
    } finally {
      process.chdir(cwdOriginal);
    }
  });

  test('NÃO deve encontrar arquivos em pastas proibidas (node_modules)', () => {
    const cwdOriginal = process.cwd();
    try {
      process.chdir(TEMP_DIR);
      
      const entrada = 'Tente ler @secreto.key';
      const resultado = injetarArquivos(entrada);
      
      assert.match(resultado, /ERRO/);
      assert.match(resultado, /não foi encontrado/);
      assert.doesNotMatch(resultado, /Nao deveria ler isso/);
    } finally {
      process.chdir(cwdOriginal);
    }
  });
});

describe('Testes do Extrator de Sugestões (###ARQUIVO)', () => {

  test('Deve extrair um único arquivo corretamente', () => {
    const textoIA = `
    Aqui está o código:
    ###ARQUIVO: app.js
    console.log("Hello");
    ###FIM_ARQUIVO
    Espero que goste.
    `;

    const sugestoes = extrairSugestoesArquivos(textoIA);
    
    assert.strictEqual(sugestoes.length, 1);
    assert.strictEqual(sugestoes[0].nome, 'app.js');
    assert.match(sugestoes[0].conteudo, /console.log\("Hello"\)/);
  });

  test('Deve extrair múltiplos arquivos de uma só vez', () => {
    const textoIA = `
    Criei dois arquivos:
    
    ###ARQUIVO: styles.css
    body { color: red; }
    ###FIM_ARQUIVO

    E também:

    ###ARQUIVO: utils/math.js
    export const sum = (a,b) => a+b;
    ###FIM_ARQUIVO
    `;

    const sugestoes = extrairSugestoesArquivos(textoIA);
    
    assert.strictEqual(sugestoes.length, 2);
    assert.strictEqual(sugestoes[0].nome, 'styles.css');
    assert.strictEqual(sugestoes[1].nome, 'utils/math.js');
    assert.match(sugestoes[1].conteudo, /export const sum/);
  });

  test('Deve ignorar blocos mal formados ou sem nome', () => {
    const textoRuim = `
    ###ARQUIVO: 
    Conteudo sem nome
    ###FIM_ARQUIVO
    `;
    const sugestoes = extrairSugestoesArquivos(textoRuim);
    assert.strictEqual(sugestoes.length, 0);
  });
});