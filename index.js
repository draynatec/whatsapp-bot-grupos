const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const Tesseract = require('tesseract.js');

const WEATHER_API_KEY = '180053f3bc0132b960f34201304e89a7';
const logsPath = path.join(__dirname, 'logs');
const tmpDir = os.tmpdir();
if (!fs.existsSync(logsPath)) fs.mkdirSync(logsPath);

function log(msg) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(path.join(logsPath, 'bot.log'), `[${timestamp}] ${msg}\n`);
    console.log(`[${timestamp}] ${msg}`);
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => log('Bot conectado e pronto!'));
client.on('auth_failure', msg => log(`Falha na autenticação: ${msg}`));
client.on('disconnected', reason => log(`Desconectado: ${reason}`));

// Listas de controle
const cumprimentosCurtos = ['bom dia', 'boa tarde', 'boa noite'];
const palavrasPermitidasOCR = cumprimentosCurtos;
const palavrasBloqueadas = ['promoção', 'compre', 'venda', 'oferta', 'desconto', 'loja'];
const stickerCounts = {};
const blockedUsers = {};
const BLOCK_TIME = 5 * 60 * 1000;

client.on('message', async msg => {
    if (!msg.from.endsWith('@g.us')) return;
    const senderId = msg.author || msg.from;
    const body = msg.body?.toLowerCase() || '';

    // Bloqueio ativo
    if (blockedUsers[senderId] && Date.now() < blockedUsers[senderId]) {
        await msg.delete(true).catch(() => {});
        return;
    } else if (blockedUsers[senderId]) {
        delete blockedUsers[senderId];
        stickerCounts[senderId] = 0;
    }

    if (body === '!id') {
        return msg.reply(`ID do grupo: ${msg.from}`);
    }

    if (body === '!clima') {
        try {
            const res = await axios.get(`https://api.openweathermap.org/data/2.5/forecast?q=Catanduva,BR&appid=${WEATHER_API_KEY}&units=metric&lang=pt_br`);
            const previsão = res.data.list[0];
            const texto = `*Previsão para Catanduva-SP:*\n` +
                `Temperatura: ${previsão.main.temp}°C\n` +
                `Céu: ${previsão.weather[0].description}\n` +
                `Umidade: ${previsão.main.humidity}%\n` +
                `Nuvens: ${previsão.clouds.all}%\n` +
                `Chance de chuva: ${Math.round((previsão.pop || 0) * 100)}%`;
            return msg.reply(texto);
        } catch {
            return msg.reply('Erro ao buscar clima.');
        }
    }

    // Apagar anúncios
    if (palavrasBloqueadas.some(p => body.includes(p))) {
        await msg.delete(true).catch(() => {});
        return msg.reply('*Mensagem de anúncio apagada automaticamente*');
    }

    // Apagar cumprimentos curtos
    if (cumprimentosCurtos.some(f => body.includes(f)) && body.split(' ').length <= 5) {
        await msg.delete(true).catch(() => {});
        return msg.reply('*Mensagem apagada: cumprimento curto*');
    }

    // OCR: apagar somente se tiver cumprimentos nas imagens
    if (msg.hasMedia && msg.type === 'image') {
        try {
            const media = await msg.downloadMedia();
            const filePath = path.join(tmpDir, `${Date.now()}.png`);
            fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'));

            const result = await Tesseract.recognize(filePath, 'por');
            const texto = result.data.text
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z\s]/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            fs.unlinkSync(filePath);

            const encontrouFrase = palavrasPermitidasOCR.some(frase => texto.includes(
                frase.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
            ));

            if (encontrouFrase) {
                await msg.delete(true).catch(() => {});
                log(`Imagem apagada por conter frase proibida: "${texto}"`);
            }
        } catch (err) {
            log('Erro no OCR: ' + err.message);
        }
    }

    // Controle de stickers e GIFs
    const isSticker = msg.type === 'sticker';
    const isGif = msg.hasMedia && msg._data?.isGif === true;

    if (isSticker || isGif) {
        stickerCounts[senderId] = (stickerCounts[senderId] || 0) + 1;

        if (stickerCounts[senderId] === 3) {
            await msg.reply(`Evite excesso de figurinhas/GIFs ou será silenciado.`);
        } else if (stickerCounts[senderId] > 3) {
            blockedUsers[senderId] = Date.now() + BLOCK_TIME;
            await msg.reply(`Você foi silenciado por 5 minutos por excesso de figurinhas/GIFs.`);
        }

        await msg.delete(true).catch(() => {});
        return;
    }

    // Reset contador se enviar algo diferente
    if (!isSticker && !isGif) {
        stickerCounts[senderId] = 0;
    }
});

client.initialize();