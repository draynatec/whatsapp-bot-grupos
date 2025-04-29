// Importações
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Chave da API do clima
const WEATHER_API_KEY = '180053f3bc0132b960f34201304e89a7';

// Pasta de logs
const logsPath = path.join(__dirname, 'logs');
if (!fs.existsSync(logsPath)) fs.mkdirSync(logsPath);

// Função de log
function log(message) {
    const logFile = path.join(logsPath, 'bot.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
    console.log(`[${timestamp}] ${message}`);
}

// Inicializa cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--single-process', '--disable-gpu']
    }
});

// Eventos de conexão
client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    log('QR Code gerado! Escaneie com o WhatsApp.');
});
client.on('ready', () => log('Bot conectado e pronto!'));
client.on('auth_failure', msg => log(`Falha na autenticação: ${msg}`));
client.on('disconnected', reason => log(`Bot desconectado: ${reason}`));

// Controle de bloqueios
const stickerCounts = {};
const blockedUsers = {};
const BLOCK_TIME = 5 * 60 * 1000; // 5 minutos

// Evento principal
client.on('message', async msg => {
    if (!msg.from.endsWith('@g.us')) return;

    const senderId = msg.author || msg.from;
    const body = msg.body?.toLowerCase() || '';

    // Verifica bloqueio
    if (blockedUsers[senderId]) {
        const restante = blockedUsers[senderId] - Date.now();
        if (restante > 0) {
            try {
                await msg.delete(true);
                log(`Mensagem apagada de bloqueado: ${senderId}`);
            } catch (err) {
                log(`Erro ao apagar de bloqueado: ${err}`);
            }
            return;
        } else {
            delete blockedUsers[senderId];
            stickerCounts[senderId] = 0;
        }
    }

    // !id - mostra ID do grupo
    if (body === '!id') {
        await msg.reply(`ID deste grupo: ${msg.from}`);
        log(`Comando !id usado por ${senderId}`);
        return;
    }

    // !clima - previsão do tempo no privado
    if (body === '!clima') {
        const contact = await msg.getContact();
        try {
            const res = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=Catanduva,BR&appid=${WEATHER_API_KEY}&units=metric&lang=pt_br`);
            const data = res.data;
            const texto = `*Previsão para Catanduva-SP:*\n` +
                          `Temperatura: ${data.main.temp}°C\n` +
                          `Céu: ${data.weather[0].description}\n` +
                          `Umidade: ${data.main.humidity}%\n` +
                          `Chance de chuva: ${data.clouds.all}%`;
            await client.sendMessage(contact.id._serialized, texto);
            log(`Clima enviado no privado de ${senderId}`);
        } catch (err) {
            log('Erro ao buscar clima: ' + err);
            await msg.reply('Erro ao obter previsão do tempo.');
        }
        return;
    }

    // Anúncios
    const anuncios = ['compre', 'promoção', 'venda', 'loja', 'desconto', 'oferta'];
    if (anuncios.some(p => body.includes(p))) {
        try {
            await msg.delete(true);
            await msg.reply('*Mensagem de anúncio apagada*');
            log(`Anúncio apagado: ${body}`);
        } catch (err) {
            log(`Erro ao apagar anúncio: ${err}`);
        }
        return;
    }

    // Cumprimentos curtos
    const cumprimentos = ['bom dia', 'boa tarde', 'boa noite'];
    if (cumprimentos.some(f => body.includes(f)) && body.split(' ').length <= 5) {
        try {
            await msg.delete(true);
            await msg.reply('*Mensagem de cumprimento apagada*');
            log(`Cumprimento apagado: ${body}`);
        } catch (err) {
            log(`Erro ao apagar cumprimento: ${err}`);
        }
        return;
    }

    // Stickers e GIFs
    if (msg.type === 'sticker' || (msg.type === 'image' && msg._data?.isAnimated)) {
        stickerCounts[senderId] = (stickerCounts[senderId] || 0) + 1;

        if (stickerCounts[senderId] === 3) {
            try {
                const contact = await msg.getContact();
                const nome = contact.pushname || contact.number;
                await msg.reply(`*${nome}*, pare de enviar figurinhas ou GIFs! Você será silenciado se continuar.`);
                await msg.delete(true);
                log(`Advertência enviada a ${senderId}`);
            } catch (err) {
                log(`Erro na advertência: ${err}`);
            }
            return;
        }

        if (stickerCounts[senderId] > 3) {
            blockedUsers[senderId] = Date.now() + BLOCK_TIME;
            try {
                await msg.delete(true);
                const contact = await msg.getContact();
                const nome = contact.pushname || contact.number;
                await msg.reply(`*${nome}* foi silenciado por 5 minutos por excesso de figurinhas ou GIFs.`);
                log(`Silenciado ${senderId}`);
            } catch (err) {
                log(`Erro ao silenciar: ${err}`);
            }
            return;
        }

        try {
            await msg.delete(true); // apaga silenciosamente
            log(`Sticker ou GIF apagado de ${senderId}`);
        } catch (err) {
            log(`Erro ao apagar sticker/GIF: ${err}`);
        }
        return;
    }

    // Zera contagem se não for figurinha ou gif
    if (stickerCounts[senderId]) stickerCounts[senderId] = 0;
});

// Inicia o bot
client.initialize();