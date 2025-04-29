const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// --- CONFIGURAÇÃO (só depois de descobrir o ID) ---
// const allowedGroupId = '120363418128652043@g.us';  // <- só usar depois!

// Pasta de logs
const logsPath = path.join(__dirname, 'logs');
if (!fs.existsSync(logsPath)) {
    fs.mkdirSync(logsPath);
}

// Função de log
function log(message) {
    const logFilePath = path.join(logsPath, 'bot.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFilePath, `[${timestamp}] ${message}\n`);
    console.log(`[${timestamp}] ${message}`);
}

// Inicializa o cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

// Quando gerar QR Code
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    log('QR Code gerado, escaneie usando seu WhatsApp');
});

// Quando o bot ficar pronto
client.on('ready', () => {
    log('Bot conectado com sucesso!');
});

// Escutando mensagens
client.on('message', async (msg) => {
    console.log('Mensagem recebida de:', msg.from);

    if (!msg.isGroupMsg) return;  // Só responde em grupos

    // Comando para pegar o ID do grupo
    if (msg.body === '!id') {
        await msg.reply(`O ID deste grupo é: ${msg.chatId}`);
        log(`Comando !id usado no grupo: ${msg.chatId}`);
        return;
    }

    // --- DEPOIS DE PEGAR O ID, ATIVAR ISSO ---
    /*
    if (msg.chatId !== allowedGroupId) {
        return; // Ignora mensagens de outros grupos
    }
    */

    const body = msg.body.toLowerCase();
    const wordCount = body.trim().split(/\s+/).length;

    // Detectar palavras proibidas (anúncios)
    const keywords = ['compre', 'promoção', 'venda', 'loja', 'desconto', 'oferta'];

    if (keywords.some(word => body.includes(word))) {
        try {
            await msg.delete(true);
            await msg.reply('*Mensagem apagada: anúncios não são permitidos.*');
            log(`Mensagem de anúncio apagada: "${msg.body}"`);
        } catch (err) {
            log(`Erro ao apagar anúncio: ${err}`);
        }
        return;
    }

    // Detectar spam de bom dia/boa tarde/boa noite
    if (['bom dia', 'boa tarde', 'boa noite'].some(phrase => body.includes(phrase))) {
        if (wordCount < 4) {
            try {
                await msg.delete(true);
                await msg.reply('*Mensagem apagada: spam de saudação.*');
                log(`Mensagem de saudação apagada: "${msg.body}"`);
            } catch (err) {
                log(`Erro ao apagar saudação: ${err}`);
            }
            return;
        }
    }

    // Detectar e apagar figurinhas
    if (msg.type === 'sticker') {
        try {
            await msg.delete(true);
            await msg.reply('*Sticker apagado: não permitido no grupo.*');
            log('Sticker apagado.');
        } catch (err) {
            log(`Erro ao apagar sticker: ${err}`);
        }
        return;
    }
});

// Tratamento de erros
client.on('auth_failure', (msg) => {
    log(`Falha na autenticação: ${msg}`);
});

client.on('disconnected', (reason) => {
    log(`Bot desconectado: ${reason}`);
});

// Iniciar o bot
client.initialize();