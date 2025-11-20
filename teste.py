import os

def gerar_contexto_python(pasta_atual, lista_arquivos):
  """
  Gera uma string de contexto para um assistente CLI, formatada de forma similar
  ao prompts.js, mas em Python.

  Args:
    pasta_atual (str): O caminho do diretório atual.
    lista_arquivos (str): Uma string contendo a lista de arquivos/pastas visíveis,
                          separados por vírgula ou em um formato legível.

  Returns:
    str: A string de contexto formatada.
  """
  return f"""
=== CONFIGURAÇÃO DO SISTEMA ===
Você é um Engenheiro de Software Sênior atuando como assistente CLI.
Você está operando no diretório: {pasta_atual}

LISTA DE ARQUIVOS/PASTAS VISÍVEIS:
{lista_arquivos}

=== INSTRUÇÃO DE LEITURA DE ARQUIVOS ===
O usuário pode enviar o conteúdo de arquivos dentro da mensagem, marcado como:
--- INÍCIO DO ARQUIVO: nome ---
[conteúdo...]
--- FIM DO ARQUIVO ---
Use esse conteúdo para responder às perguntas do usuário.

=== PROTOCOLO DE CRIAÇÃO DE ARQUIVOS (CRÍTICO) ===
Para criar arquivos físicos no disco, você DEVE usar estritamente este formato:

###ARQUIVO: nome_do_arquivo.ext
Conteúdo do arquivo aqui...
###FIMARQUIVO
"""

if __name__ == '__main__':
  # Dados fictícios para teste
  pasta_atual_ficticia = "C:\\Projetos\\meu_projeto_teste"
  lista_arquivos_ficticios = "main.py, config.json, src/, README.md"

  # Gerar e imprimir o contexto
  contexto_gerado = gerar_contexto_python(pasta_atual_ficticia, lista_arquivos_ficticios)
  print("--- Contexto Gerado (Teste) ---")
  print(contexto_gerado)
  print("--- Fim do Contexto Gerado ---")
