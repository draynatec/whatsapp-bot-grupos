const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// ID do grupo permitido (depois você vai pegar usando !id)
const allowedGroupId = '120363418128652043@g.us';

// Pasta de logs
const logsPath = path.join(__dirname, 'logs');
if (!fs.existsSync(logsPath)) {
    fs.mkdirSync(logsPath);
}

// Função para registrar logs
function log(message) {
    const logFilePath = path.join(logsPath, 'bot.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFilePath, `[${timestamp}] ${message}\n`);
    console.log(`[${timestamp}] ${message}`);
}

// Inicializa o cliente do WhatsApp - AQUI ESTÁ O AJUSTE
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

// Exibe o QR Code no terminal
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    log('QR Code gerado, escaneie usando seu WhatsApp');
});

// Conectado
client.on('ready', () => {
    log('Bot conectado com sucesso!');
});

// Escuta as mensagens
client.on('message', async (msg) => {
    console.log('Mensagem recebida de:', msg.from);

    if (!msg.isGroupMsg) return;

    // [NOVO] Comando para mostrar o ID do grupo
    if (msg.body === '!id') {
        await msg.reply(`O ID deste grupo é: ${msg.chatId}`);
        log(`Comando !id usado no grupo ${msg.chatId}`);
        return;
    }

    // Só responde em grupos permitidos
    if (msg.chatId !== allowedGroupId) return;

    const body = msg.body.toLowerCase();
    const wordCount = body.trim().split(/\s+/).length;

    // Detectar anúncios
    const keywords = ['compre', 'promoção', 'venda', 'loja', 'desconto', 'oferta'];

    if (keywords.some(word => body.includes(word))) {
        await msg.delete(true);
        await msg.reply('*Essa mensagem viola as regras do grupo*');
        log(`Mensagem de anúncio apagada: "${msg.body}"`);
        return;
    }

    // Detectar bom dia, boa tarde, boa noite spam
    if (['bom dia', 'boa tarde', 'boa noite'].some(phrase => body.includes(phrase))) {
        if (wordCount < 4 || body.match(/bo+m+\s*dia|boa+\s*tarde+|boa+\s*noite+/)) {
            await msg.delete(true);
            await msg.reply('*Essa mensagem viola as regras do grupo*');
            log(`Mensagem de saudação curta apagada: "${msg.body}"`);
            return;
        }
    }

// // if (msg.type === 'sticker') {
    try {
        log('Tentando apagar sticker...');
        await msg.delete(true);
        await msg.reply('*Essa mensagem viola as regras do grupo (Sticker apagado)*');
        log('Sticker apagado com sucesso.');
    } catch (err) {
        log(`Erro ao tentar apagar sticker: ${err}`);
    }
    return;
}
});

// Tratamento de erro
client.on('auth_failure', (msg) => {
    log(`Falha na autenticação: ${msg}`);
});

client.on('disconnected', (reason) => {
    log(`Bot desconectado: ${reason}`);
});

// Inicializa
client.initialize();