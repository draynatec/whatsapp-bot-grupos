const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const config = require('./config.json');

if (!fs.existsSync('./logs')) fs.mkdirSync('./logs');

const floodMap = new Map();

const logAction = (text) => {
    const time = new Date().toISOString();
    fs.appendFileSync(config.logFile, `[${time}] ${text}\n`);
};

const logError = (text) => {
    const time = new Date().toISOString();
    fs.appendFileSync(config.errorLogFile, `[${time}] ${text}\n`);
};

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
});

client.on('qr', qr => {
    console.log('QR Code gerado, escaneie com seu WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('Bot conectado com sucesso!');
    const chats = await client.getChats();
    const groupChats = chats.filter(c => c.isGroup);
    console.log(`Conectado a ${groupChats.length} grupos.`);
});

client.on('auth_failure', msg => {
    console.error('Falha na autenticação:', msg);
});

client.on('disconnected', reason => {
    console.log('Bot desconectado:', reason);
    client.initialize();
});

client.on('group_join', async (notification) => {
    if (!config.welcomeMessages) return;
    const chat = await notification.getChat();
    chat.sendMessage(`Seja bem-vindo(a) @${notification.recipientIds[0].split('@')[0]} ao grupo *${chat.name}*!`, { mentions: [notification.recipientIds[0]] });
});

client.on('message', async message => {
    try {
        const chat = await message.getChat();
        if (!chat.isGroup) return;

        const sender = await message.getContact();
        const content = message.body.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const wordCount = content.trim().split(/\s+/).length;
        let shouldDelete = false;

        const participant = chat.participants.find(p => p.id._serialized === sender.id._serialized);
        const isAdmin = participant ? participant.isAdmin || participant.isSuperAdmin : false;

        if (config.protectAdmins && isAdmin) return; // Protege admins

        // Flood Protection
        if (config.floodProtection.enabled) {
            const userKey = sender.id._serialized;
            if (!floodMap.has(userKey)) {
                floodMap.set(userKey, []);
            }
            const timestamps = floodMap.get(userKey);
            const now = Date.now();
            timestamps.push(now);
            floodMap.set(userKey, timestamps.filter(ts => now - ts < config.floodProtection.timeWindow * 1000));
            if (floodMap.get(userKey).length > config.floodProtection.limit) {
                shouldDelete = true;
            }
        }

        // Bloqueio por palavras proibidas
        for (let word of config.blockedWords) {
            if (content.includes(word)) {
                shouldDelete = true;
                break;
            }
        }

        // Mensagens automáticas
        for (let phrase of config.autoDeleteMessages) {
            if (content.includes(phrase) && wordCount < config.minWords) {
                shouldDelete = true;
                break;
            }
        }

        // Deleta figurinhas
        if (message.hasMedia) {
            const media = await message.downloadMedia();
            if (media.mimetype === 'image/webp') {
                shouldDelete = true;
            }
        }

        if (shouldDelete) {
            await message.delete(true);
            await chat.sendMessage(`*Essa mensagem de @${sender.id.user} viola as regras do Grupo*`, { mentions: [sender] });
            logAction(`Mensagem deletada de ${sender.pushname || sender.number} no grupo ${chat.name}: ${content}`);
        }

    } catch (error) {
        console.error('Erro ao processar mensagem:', error);
        logError(error.toString());
    }
});

client.initialize();