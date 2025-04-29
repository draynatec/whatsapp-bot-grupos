// Importações
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// Pasta de logs
const logsPath = path.join(__dirname, 'logs');
if (!fs.existsSync(logsPath)) {
    fs.mkdirSync(logsPath);
}

// Função para salvar logs
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

// Exibe QR Code no terminal
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    log('QR Code gerado! Escaneie com o WhatsApp.');
});

// Confirmação de conexão
client.on('ready', () => {
    log('Bot conectado e pronto!');
});

// Controle de stickers
const stickerCounts = {};
const blockedUsers = {};
const BLOCK_TIME = 5 * 60 * 1000; // 5 minutos

// Evento de recebimento de mensagens
client.on('message', async (msg) => {
    console.log('Mensagem recebida de:', msg.from);

    // Apenas grupos
    if (!msg.from.endsWith('@g.us')) return;

    const senderId = msg.author || msg.from;
    const body = msg.body ? msg.body.toLowerCase() : '';

    // Verifica se o usuário está bloqueado
    if (blockedUsers[senderId]) {
        const remaining = blockedUsers[senderId] - Date.now();
        if (remaining > 0) {
            try {
                await msg.delete(true);
                log(`Mensagem apagada de ${senderId} (usuário bloqueado)`);
            } catch (err) {
                log(`Erro ao apagar mensagem de bloqueado: ${err}`);
            }
            return;
        } else {
            delete blockedUsers[senderId];
            stickerCounts[senderId] = 0;
        }
    }

    // Comando para mostrar ID do grupo
    if (body === '!id') {
        await msg.reply(`ID deste grupo é: ${msg.from}`);
        log(`Comando !id usado no grupo ${msg.from}`);
        return;
    }

    // Palavras-chave de anúncios
    const anuncios = ['compre', 'promoção', 'venda', 'loja', 'desconto', 'oferta'];
    if (anuncios.some(palavra => body.includes(palavra))) {
        try {
            await msg.delete(true);
            await msg.reply('*Mensagem de anúncio apagada*');
            log(`Mensagem de anúncio apagada: "${msg.body}"`);
        } catch (err) {
            log(`Erro ao apagar anúncio: ${err}`);
        }
        return;
    }

    // Detectar cumprimentos curtos
    const cumprimentos = ['bom dia', 'boa tarde', 'boa noite'];
    if (cumprimentos.some(frase => body.includes(frase)) && body.split(' ').length <= 5) {
        try {
            await msg.delete(true);
            await msg.reply('*Mensagem de cumprimento apagada*');
            log(`Cumprimento apagado: "${msg.body}"`);
        } catch (err) {
            log(`Erro ao apagar cumprimento: ${err}`);
        }
        return;
    }

    // Apagar figurinhas (stickers) com controle
    if (msg.type === 'sticker') {
        stickerCounts[senderId] = (stickerCounts[senderId] || 0) + 1;

        if (stickerCounts[senderId] > 2) {
            blockedUsers[senderId] = Date.now() + BLOCK_TIME;
            try {
                await msg.delete(true);
                await msg.reply('*Você enviou muitas figurinhas. Está temporariamente bloqueado.*');
                log(`Usuário ${senderId} bloqueado por excesso de figurinhas.`);
            } catch (err) {
                log(`Erro ao apagar sticker excessivo: ${err}`);
            }
            return;
        }

        try {
            await msg.delete(true);
            await msg.reply('*Sticker apagado*');
            log('Sticker apagado com sucesso.');
        } catch (err) {
            log(`Erro ao apagar sticker: ${err}`);
        }
        return;
    }

    // Zera contagem se não for figurinha
    if (stickerCounts[senderId]) {
        stickerCounts[senderId] = 0;
    }
});

// Erro de autenticação
client.on('auth_failure', (msg) => {
    log(`Falha na autenticação: ${msg}`);
});

// Desconexão
client.on('disconnected', (reason) => {
    log(`Bot desconectado: ${reason}`);
});

// Inicializar o cliente
client.initialize();