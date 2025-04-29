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

// Evento de recebimento de mensagens
client.on('message', async (msg) => {
    console.log('Mensagem recebida de:', msg.from);

    // Apenas grupos
    if (!msg.from.endsWith('@g.us')) return;

    const body = msg.body.toLowerCase();

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

    // Apagar figurinhas (stickers)
    if (msg.type === 'sticker') {
        try {
            await msg.delete(true);
            await msg.reply('*Sticker apagado*');
            log('Sticker apagado com sucesso.');
        } catch (err) {
            log(`Erro ao apagar sticker: ${err}`);
        }
        return;
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