const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const allowedGroupId = 'SEU_ID_DO_GRUPO@g.us'; // coloque o id correto
const logsPath = path.join(__dirname, 'logs');

if (!fs.existsSync(logsPath)) {
    fs.mkdirSync(logsPath);
}

function log(message) {
    const logFilePath = path.join(logsPath, 'bot.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFilePath, `[${timestamp}] ${message}\n`);
    console.log(`[${timestamp}] ${message}`);
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

const spamControl = {}; // Controle de stickers e bloqueios

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    log('QR Code gerado, escaneie usando seu WhatsApp');
});

client.on('ready', () => {
    log('Bot conectado com sucesso!');
});

client.on('message', async (msg) => {
    if (!msg.isGroupMsg) return;
    if (msg.chatId !== allowedGroupId) return;

    const userId = msg.author || msg.from;

    // Controle de bloqueio por spam
    if (spamControl[userId] && spamControl[userId].blockedUntil > Date.now()) {
        await msg.delete(true);
        log(`Mensagem apagada de usuário bloqueado: ${userId}`);
        return;
    }

    // Se for sticker
    if (msg.type === 'sticker') {
        if (!spamControl[userId]) {
            spamControl[userId] = { stickers: 0, blockedUntil: 0 };
        }
        spamControl[userId].stickers++;

        if (spamControl[userId].stickers > 2) {
            // BLOQUEAR usuário
            spamControl[userId].blockedUntil = Date.now() + (5 * 60 * 1000); // 5 minutos
            spamControl[userId].stickers = 0; // Zera o contador
            await msg.reply('*Você foi bloqueado temporariamente por enviar muitos stickers.*');
            log(`Usuário bloqueado temporariamente: ${userId}`);
        } else {
            log(`Sticker recebido de: ${userId} (Total: ${spamControl[userId].stickers})`);
        }

        // Apaga o sticker
        try {
            await msg.delete(true);
            log('Sticker apagado.');
        } catch (err) {
            log(`Erro ao apagar sticker: ${err}`);
        }

        return;
    }

    // Comando para pegar o ID do grupo
    if (msg.body === '!id') {
        await msg.reply(`O ID deste grupo é: ${msg.chatId}`);
        log(`Comando !id usado no grupo ${msg.chatId}`);
        return;
    }

    // Apagar mensagens de anúncios ou saudações curtas
    const body = msg.body.toLowerCase();
    const wordCount = body.trim().split(/\s+/).length;
    const keywords = ['compre', 'promoção', 'venda', 'loja', 'desconto', 'oferta'];

    if (keywords.some(word => body.includes(word))) {
        await msg.delete(true);
        await msg.reply('*Essa mensagem viola as regras do grupo*');
        log(`Mensagem de anúncio apagada: "${msg.body}"`);
        return;
    }

    if (['bom dia', 'boa tarde', 'boa noite'].some(phrase => body.includes(phrase))) {
        if (wordCount < 4 || body.match(/bo+m+\s*dia|boa+\s*tarde+|boa+\s*noite+/)) {
            await msg.delete(true);
            await msg.reply('*Essa mensagem viola as regras do grupo*');
            log(`Mensagem de saudação curta apagada: "${msg.body}"`);
            return;
        }
    }
});

client.on('auth_failure', (msg) => {
    log(`Falha na autenticação: ${msg}`);
});

client.on('disconnected', (reason) => {
    log(`Bot desconectado: ${reason}`);
});

client.initialize();