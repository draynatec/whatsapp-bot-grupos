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
    const logFile = path.join(logsPath, 'bot.log');
    fs.appendFileSync(logFile, `[${timestamp}] ${msg}\n`);
    console.log(`[${timestamp}] ${msg}`);
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
});

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    log('QR Code gerado! Escaneie com o WhatsApp.');
});
client.on('ready', () => log('Bot conectado e pronto!'));
client.on('auth_failure', msg => log(`Falha na autenticação: ${msg}`));
client.on('disconnected', reason => log(`Bot desconectado: ${reason}`));

// Regras e listas
const stickerCounts = {};
const blockedUsers = {};
const BLOCK_TIME = 5 * 60 * 1000; // 5 min

const cumprimentos = ['bom dia', 'boa tarde', 'boa noite'];
const palavrasChave = [
    'bom dia', 'boa tarde', 'boa noite',
    'deus te abençoe', 'abençoado', 'abençoados',
    'que deus', 'paz', 'fé', 'esperança', 'gratidao'
];
const anuncios = ['compre', 'promoção', 'venda', 'loja', 'desconto', 'oferta'];

client.on('message', async msg => {
    if (!msg.from.endsWith('@g.us')) return;

    const senderId = msg.author || msg.from;
    const body = msg.body?.toLowerCase() || '';

    // Bloqueio temporário
    if (blockedUsers[senderId]) {
        if (Date.now() < blockedUsers[senderId]) {
            try {
                await msg.delete(true);
                log(`Mensagem apagada de usuário bloqueado: ${senderId}`);
            } catch (err) {
                log(`Erro ao apagar mensagem bloqueada: ${err}`);
            }
            return;
        } else {
            delete blockedUsers[senderId];
            stickerCounts[senderId] = 0;
        }
    }

    // Comando !id
    if (body === '!id') {
        await msg.reply(`ID deste grupo: ${msg.from}`);
        log(`Comando !id usado por ${senderId}`);
        return;
    }

    // Comando !clima
    if (body === '!clima') {
        const contact = await msg.getContact();
        try {
            const res = await axios.get(`https://api.openweathermap.org/data/2.5/forecast?q=Catanduva,BR&appid=${WEATHER_API_KEY}&units=metric&lang=pt_br`);
            const data = res.data;
            const previsao = data.list[0];
            const temp = previsao.main.temp;
            const descricao = previsao.weather[0].description;
            const umidade = previsao.main.humidity;
            const nuvens = previsao.clouds.all;
            const chanceChuva = Math.round((previsao.pop || 0) * 100);

            const texto = `*Previsão para Catanduva-SP:*\n` +
                `Temperatura: ${temp}°C\n` +
                `Céu: ${descricao}\n` +
                `Umidade: ${umidade}%\n` +
                `Nuvens: ${nuvens}%\n` +
                `Chance de chuva: ${chanceChuva}%`;

            await client.sendMessage(contact.id._serialized, texto);
            log(`Previsão enviada a ${senderId}`);
        } catch (err) {
            await msg.reply('Erro ao obter previsão do tempo.');
            log('Erro ao buscar clima: ' + err);
        }
        return;
    }

    // Anúncios
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

    // OCR de imagens
    if (msg.hasMedia && msg.type === 'image') {
        try {
            const media = await msg.downloadMedia();
            const filePath = path.join(tmpDir, `${Date.now()}.png`);
            fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'));

            const { data: { text } } = await Tesseract.recognize(filePath, 'por', {
                logger: m => log(`OCR: ${m.status} - ${Math.round(m.progress * 100)}%`)
            });

            fs.unlinkSync(filePath);

            const texto = text
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            const palavrasNorm = palavrasChave.map(f =>
                f.toLowerCase()
                 .normalize('NFD')
                 .replace(/[\u0300-\u036f]/g, '')
                 .trim()
            );

            if (palavrasNorm.some(f => texto.includes(f))) {
                await msg.delete(true);
                log(`Imagem com frase detectada e apagada: "${texto}"`);
                return;
            }

        } catch (err) {
            log(`Erro no OCR: ${err}`);
        }
    }

    // Stickers e GIFs
    const isSticker = msg.type === 'sticker';
    const isGif = msg.hasMedia && msg._data?.isGif === true;

    if (isSticker || isGif) {
        stickerCounts[senderId] = (stickerCounts[senderId] || 0) + 1;

        if (stickerCounts[senderId] === 3) {
            try {
                const contact = await msg.getContact();
                const nome = contact.pushname || contact.number;
                await msg.reply(`*${nome}*, pare de enviar figurinhas/GIFs! Será silenciado se continuar.`);
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
                await msg.reply(`*${nome}* foi silenciado por 5 minutos por excesso de figurinhas/GIFs.`);
                log(`Usuário silenciado: ${senderId}`);
            } catch (err) {
                log(`Erro ao silenciar: ${err}`);
            }
            return;
        }

        try {
            await msg.delete(true);
            log(`Sticker/GIF apagado de ${senderId}`);
        } catch (err) {
            log(`Erro ao apagar sticker/GIF: ${err}`);
        }
        return;
    }

    // Reseta contagem
    if (stickerCounts[senderId]) stickerCounts[senderId] = 0;
});

client.initialize();