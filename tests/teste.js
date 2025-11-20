import process from "process";

const API_KEY = "REMOVIDO_POR_SEGURANCA"; // <--- COLOCAR SUA CHAVE AQUI

if (API_KEY === "SUA_API_KEY_AQUI") {
    console.error("ERRO: Você esqueceu de colocar a chave no arquivo teste.js!");
    process.exit(1);
}

console.log("--- Perguntando ao Google quais modelos você pode usar ---");
console.log("Usando chave iniciada em: " + API_KEY.substring(0, 5) + "...");

async function checkModels() {
    try {
        // Fazemos uma chamada "pura" na API, sem biblioteca no meio
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        
        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.models) {
            console.log("A API respondeu, mas a lista de modelos veio vazia.");
            return;
        }

        console.log("\nSUCESSO! Aqui estão os nomes exatos que sua chave aceita:\n");
        
        // Filtra apenas os modelos que geram texto (generateContent)
        const chatModels = data.models.filter(m => m.supportedGenerationMethods.includes("generateContent"));
        
        chatModels.forEach(model => {
            console.log(`Nome: ${model.name.replace("models/", "")}`);
            console.log(`Descrição: ${model.displayName}`);
            console.log("-".repeat(20));
        });

    } catch (error) {
        console.error("\nFALHA GRAVE:");
        console.error(error.message);
        console.log("\nPossíveis causas:");
        console.log("1. A chave API foi copiada errada.");
        console.log("2. A chave API é de um projeto do Google Cloud (Vertex AI) e não do AI Studio.");
    }
}

checkModels();