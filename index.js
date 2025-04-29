// Importações
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Chave da API de previsão do tempo
const WEATHER_API_KEY = '180053f3bc0132b960f34201304e89a7';

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

    // Comando para previsão do tempo
    if (body === '!clima') {
        const contact = await msg.getContact();

        try {
            const res = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=Catanduva,BR&appid=${WEATHER_API_KEY}&units=metric&lang=pt_br`);
            const data = res.data;

            const chanceChuva = data.weather[0].main.toLowerCase().includes('rain') ? 'Alta chance de chuva' : 'Sem chuva prevista';
            const texto = `*Previsão para Catanduva-SP:*\n` +
                          `Temperatura: ${data.main.temp}°C\n` +
                          `Céu: ${data.weather[0].description}\n` +
                          `Umidade: ${data.main.humidity}%\n` +
                          `${chanceChuva}`;

            await client.sendMessage(contact.id._serialized, texto);
            log(`Previsão enviada no privado de ${contact.id.user}`);
        } catch (err) {
            log('Erro ao buscar clima: ' + err);
            await msg.reply('Erro ao obter a previsão do tempo.');
        }
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

    // Lógica para figurinhas com advertência e bloqueio
    if (msg.type === 'sticker') {
        stickerCounts[senderId] = (stickerCounts[senderId] || 0) + 1;

        if (stickerCounts[senderId] === 3) {
            try {
                const contact = await msg.getContact();
                const nome = contact.pushname || contact.number;
                await msg.reply(`*${nome}*, pare de mandar figurinhas! Você será silenciado se continuar.`);
                await msg.delete(true);
                log(`Advertência enviada para ${senderId}`);
            } catch (err) {
                log(`Erro ao advertir: ${err}`);
            }
            return;
        }

        if (stickerCounts[senderId] > 3) {
            blockedUsers[senderId] = Date.now() + BLOCK_TIME;
            try {
                await msg.delete(true);
                const contact = await msg.getContact();
                const nome = contact.pushname || contact.number;
                await msg.reply(`*${nome}* foi silenciado por 5 minutos por enviar figurinhas demais.`);
                log(`Usuário ${senderId} silenciado por excesso de figurinhas.`);
            } catch (err) {
                log(`Erro ao silenciar usuário: ${err}`);
            }
            return;
        }

        // Apaga em silêncio
        try {
            await msg.delete(true);
            log(`Sticker apagado em silêncio de ${senderId}`);
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