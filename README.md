# 🚀 Gemini CLI Assistant (Modo Agente)

Este é um projeto **Node.js** que implementa um poderoso Agente de Automação de Linha de Comando (CLI) alimentado por modelos **Gemini** (com Fallback em Cascata). Ele foi projetado para atuar como um assistente de desenvolvimento, capaz de ler o código-fonte, analisar logs, sugerir alterações e executar comandos de sistema mediante sua aprovação.

## ✨ Funcionalidades Principais

* **Alta Disponibilidade (HA):** Utiliza o sistema de **Fallback em Cascata** (Smart Retry) com modelos `gemini-2.5-flash`, `gemini-2.5-pro` e `gemini-pro-latest`. Se um modelo estiver sobrecarregado (Erro 503), ele automaticamente tenta o próximo da lista.
* **Controle de Arquivos (Leitura Inteligente):**
    * **Leitura Recursiva:** Use o `@nome_do_arquivo.ext` em qualquer lugar no seu prompt. O agente procurará o arquivo em qualquer subpasta do projeto (`src/`, `utils/`, etc.) automaticamente.
    * **Escrita Segura:** Cria e modifica arquivos no disco usando o protocolo `###ARQUIVO:`, exigindo confirmação explícita (`s/n`) do usuário antes de salvar.
* **Modo Agente (Execução Segura):**
    * **Comandos Shell:** Executa comandos de terminal (Git, NPM, Windows/Linux) sugeridos pelo Gemini usando o protocolo `###CMD:`, também exigindo confirmação (`s/n`) para evitar operações destrutivas acidentais.
    * **Análise de Log/Piping:** Suporta a entrada de dados via *pipe* (`cat log.txt | gemini`), permitindo análise de logs ou dados brutos em tempo real.
* **Estrutura Modular:** Lógica de negócio separada da configuração de *prompts* e das ferramentas de sistema.
* **Segurança:** Utiliza variáveis de ambiente (`.env`) para proteger a chave de API.

## 🛠️ Estrutura do Projeto

A lógica de alto nível é separada das ferramentas de sistema para facilitar a testabilidade e manutenção.

```text
.
├── src/
│   ├── index.js              # Ponto de entrada principal (Orquestração CLI com Fallback)
│   └── utils/
│       ├── prompts.js        # Definições da Persona e Regras de Protocolo da IA.
│       └── tools.js          # Funções de sistema: leitura recursiva, salvamento seguro e execução de comandos.
├── tests/
│   └── test_tools.js         # Testes unitários para as funções de leitura e extração.
├── .env                      # Variáveis de ambiente (sua chave de API real - ignorado pelo Git)
├── .env.example              # Exemplo de variáveis necessárias.
└── package.json              # Dependências e script de execução.
````

---

## ⚙️ Instalação e Configuração

Para configurar o projeto e começar a usar o Agente CLI no seu ambiente local, siga os passos abaixo:

### 1. Pré-requisitos
Certifique-se de ter **Node.js (versão 18+ ou LTS)** e **Git** instalados e configurados no seu sistema.

### 2. Configuração de Segurança (API Key)

O projeto usa variáveis de ambiente para proteger sua chave de acesso à API.
1.  Crie um ficheiro chamado **`.env`** na raiz do projeto (este ficheiro é ignorado pelo Git).
2.  Insira sua chave Gemini, obtida no Google AI Studio:
    ```env
    GEMINI_API_KEY=AIzaS...SuaChaveGiganteAqui...
    ```

### 3. Setup do Projeto e Atalho Global

Execute os seguintes comandos na raiz do projeto para instalar dependências e criar o atalho `gemini` no seu terminal:

```bash
# Instala dependências (incluindo dotenv)
npm install

# Cria o link simbólico global para rodar "gemini" em qualquer pasta
npm link

## ⌨️ Uso

Após a configuração, basta digitar `gemini` no terminal de qualquer diretório.

### Exemplos de Uso no Modo Interativo:

| Ação Desejada | Comando na CLI | Ação do Agente |
| :--- | :--- | :--- |
| **Leitura** | `Analise o código de @index.js` | Encontra `src/index.js` (busca recursiva) e injeta o conteúdo para a IA. |
| **Criação** | `Crie um controller de auth em src/auth.js` | Sugere o código `###ARQUIVO: src/auth.js...` e pede confirmação para salvar. |
| **Execução** | `Tem algum processo na porta 3000? Se sim, finalize.` | Sugere o comando `###CMD: netstat... taskkill...` e pede confirmação para rodar. |

### Exemplo de Uso via Pipe (Análise de Logs):

Você pode enviar a saída de qualquer comando para o Gemini analisar:

```bash
# Lê um log de erro e envia o texto para análise da IA:
cat ./logs/erro.log | gemini
```

-----

Feito com ☕ e Gemini.

```
```