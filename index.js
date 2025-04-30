require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Tesseract = require('tesseract.js');
const os = require('os');
const { Configuration, OpenAIApi } = require("openai");

const tmpDir = os.tmpdir();
const WEATHER_API_KEY = '180053f3bc0132b960f34201304e89a7';
const logsPath = path.join(__dirname, 'logs');
if (!fs.existsSync(logsPath)) fs.mkdirSync(logsPath);

function log(message) {
    const logFile = path.join(logsPath, 'bot.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
    console.log(`[${timestamp}] ${message}`);
}

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

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

const stickerCounts = {};
const blockedUsers = {};
const BLOCK_TIME = 5 * 60 * 1000;

client.on('message', async msg => {
    if (!msg.from.endsWith('@g.us')) return;

    const senderId = msg.author || msg.from;
    const body = msg.body?.toLowerCase() || '';

    if (blockedUsers[senderId]) {
        const restante = blockedUsers[senderId] - Date.now();
        if (restante > 0) {
            try { await msg.delete(true); } catch {}
            return;
        } else {
            delete blockedUsers[senderId];
            stickerCounts[senderId] = 0;
        }
    }

    if (body === '!id') {
        await msg.reply(`ID do grupo: ${msg.from}`);
        return;
    }

    if (body === '!clima') {
        try {
            const res = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=Catanduva,BR&appid=${WEATHER_API_KEY}&units=metric&lang=pt_br`);
            const data = res.data;
            const texto = `*Clima em Catanduva-SP:*\n` +
                `Temperatura: ${data.main.temp}°C\n` +
                `Céu: ${data.weather[0].description}\n` +
                `Umidade: ${data.main.humidity}%\n` +
                `Nuvens: ${data.clouds.all}%`;
            await msg.reply(texto);
        } catch (err) {
            await msg.reply('Erro ao obter previsão do tempo.');
        }
        return;
    }

    const cumprimentos = ['bom dia', 'boa tarde', 'boa noite'];
    if (cumprimentos.some(f => body.includes(f)) && body.split(' ').length <= 5) {
        try { await msg.delete(true); await msg.reply('*Mensagem de cumprimento apagada*'); } catch {}
        return;
    }

    const anuncios = ['compre', 'promoção', 'venda', 'loja', 'desconto', 'oferta'];
    if (anuncios.some(p => body.includes(p))) {
        try { await msg.delete(true); await msg.reply('*Anúncio apagado*'); } catch {}
        return;
    }

    if (msg.hasMedia && msg.type === 'image') {
        try {
            const media = await msg.downloadMedia();
            const filePath = path.join(tmpDir, `${Date.now()}.png`);
            fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'));

            const { data: { text } } = await Tesseract.recognize(filePath, 'por');
            fs.unlinkSync(filePath);

            const texto = text.toLowerCase();
            if (cumprimentos.some(f => texto.includes(f))) {
                await msg.delete(true);
            }
        } catch (err) {
            log(`Erro no OCR: ${err.message}`);
        }
        return;
    }

    const isSticker = msg.type === 'sticker';
    const isGif = msg.hasMedia && msg._data?.isGif === true;

    if (isSticker || isGif) {
        stickerCounts[senderId] = (stickerCounts[senderId] || 0) + 1;

        if (stickerCounts[senderId] >= 3) {
            await msg.reply(`Evite enviar figurinhas/GIFs repetidamente!`);
            if (stickerCounts[senderId] > 3) {
                blockedUsers[senderId] = Date.now() + BLOCK_TIME;
                await msg.reply(`Usuário silenciado por 5 minutos.`);
            }
        }

        try { await msg.delete(true); } catch {}
        return;
    }

    if (!isSticker && !isGif && stickerCounts[senderId]) {
        stickerCounts[senderId] = 0;
    }

    if (body.startsWith('!pergunta')) {
        const pergunta = body.replace('!pergunta', '').trim();
        if (!pergunta) return msg.reply('Use: !pergunta Qual é a capital do Brasil?');

        await consultarIA(pergunta, client, msg);
        return;
    }
});

client.initialize();

async function consultarIA(mensagem, sock, msg) {
    try {
        const stream = await openai.createChatCompletion(
            {
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: mensagem }],
                stream: true,
            },
            { responseType: "stream" }
        );

        let resposta = "";
        let enviado = false;

        stream.data.on("data", (chunk) => {
            const payloads = chunk
                .toString()
                .split("\n")
                .filter((line) => line.trim() !== "");

            for (const payload of payloads) {
                if (payload.includes("[DONE]")) return;

                const data = JSON.parse(payload.replace(/^data: /, ""));
                const content = data.choices?.[0]?.delta?.content;
                if (content) {
                    resposta += content;

                    if (!enviado && resposta.length > 10) {
                        enviado = true;
                        sock.sendMessage(msg.from, { text: "Respondendo..." }, { quoted: msg });
                    }
                }
            }

            if (resposta.trim()) {
                sock.sendMessage(msg.from, { text: resposta.trim() }, { quoted: msg });
            }
        });

        stream.data.on("end", () => {
            if (!resposta.trim()) {
                sock.sendMessage(msg.from, { text: "Não consegui gerar resposta." }, { quoted: msg });
            }
        });
    } catch (err) {
        log(`Erro IA: ${err?.response?.data || err.message}`);
        await sock.sendMessage(msg.from, { text: "Erro ao consultar IA." }, { quoted: msg });
    }
}