import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import { injetarArquivos } from './tools.js';

describe('Testes da Ferramenta de Leitura', () => {
  
  // 1. Teste para ver se ele substitui @arquivo pelo conteúdo
  test('Deve ler um arquivo existente e substituir na string', () => {
    // PREPARAÇÃO: Criamos um arquivo falso só para o teste
    const nomeArquivoFalso = 'arquivo_teste.txt';
    const conteudoFalso = 'Ola Mundo Secreto';
    fs.writeFileSync(nomeArquivoFalso, conteudoFalso);

    // AÇÃO: Chamamos a função
    const entrada = 'Por favor leia o @arquivo_teste.txt para mim';
    const resultado = injetarArquivos(entrada);

    // LIMPEZA: Deletamos o arquivo falso
    fs.unlinkSync(nomeArquivoFalso);

    // VERIFICAÇÃO (Assert)
    // Verificamos se o texto original sumiu e o conteúdo apareceu
    assert.doesNotMatch(resultado, /@arquivo_teste.txt/); // O @ deve sumir
    assert.match(resultado, /Ola Mundo Secreto/); // O conteúdo deve aparecer
    assert.match(resultado, /--- INÍCIO DO ARQUIVO/); // O cabeçalho deve existir
  });

  // 2. Teste para ver se ele avisa quando o arquivo não existe
  test('Deve retornar erro amigável se arquivo não existe', () => {
    const entrada = 'Leia o @arquivo_fantasma.xyz';
    const resultado = injetarArquivos(entrada);

    assert.match(resultado, /ERRO/);
    assert.match(resultado, /não existe/);
  });
});