const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, ActivityType, Partials } = require('discord.js');
const axios = require('axios');
require('dotenv').config();
const { formatForDiscord, splitMessagePreservingCodeBlocks } = require('./utils/formatting');
const { SYSTEM_PROMPT } = require('./utils/prompt');
const { callChatCompletion } = require('./utils/api');
const { createWarningEmbed, createErrorEmbed } = require('./utils/embeds');
const { loadConversations, saveConversations, mapToObject, objectToMap } = require('./utils/storage');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel],
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.data.name, command);
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';

const conversationHistory = objectToMap(loadConversations());

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setPresence({
        activities: [
            { name: '/ask with GPT-OSS-20B', type: ActivityType.Playing },
        ],
        status: 'online',
    });
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) return;

    try {
        await command.execute(
            interaction,
            { apiKey: GROQ_API_KEY, model: GROQ_MODEL, baseUrl: GROQ_BASE_URL },
            conversationHistory
        );
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    }
});

// Handle normal text messages in DMs (no slash command needed)
client.on('messageCreate', async (message) => {
    try {
        if (message.author.bot) return;
        if (message.guildId) return; // only handle DMs
        const question = (message.content || '').trim();
        if (!question) return;

        // Typing indicator
        await message.channel.sendTyping();

        const channelId = message.channel.id;
        const history = conversationHistory.get(channelId) || [];

        const messages = history.map(m => ({ role: m.role, content: m.content }))
            .concat([{ role: 'user', content: question }]);

        let warned = false;
        const raw = await callChatCompletion({
            baseUrl: GROQ_BASE_URL,
            apiKey: GROQ_API_KEY,
            model: GROQ_MODEL,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...messages,
            ],
            timeoutMs: 60000,
            maxRetries: 3,
            onRetry: async (attempt, delayMs, meta) => {
                // In DMs we can optionally send a friendly message
                if (warned) return;
                warned = true;
                try {
                    await message.channel.send({
                        embeds: [
                            createWarningEmbed(
                                `The AI service is busy (retrying, attempt ${attempt + 1}). This may take a few seconds...`,
                                { title: 'Please wait' }
                            ),
                        ],
                    });
                } catch (_) { /* ignore */ }
            },
            onGiveUp: async (err) => {
                try {
                    await message.channel.send({
                        embeds: [
                            createErrorEmbed(
                                'Failed to get a response from the AI service. Please try again later.',
                                { title: 'Service Unavailable' }
                            ),
                        ],
                    });
                } catch (_) { /* ignore */ }
            }
        });
        const text = formatForDiscord(raw);

        history.push({ role: 'user', content: question });
        // Keep raw in history
        history.push({ role: 'assistant', content: raw });
        const MAX_MESSAGES = 20;
        const trimmed = history.slice(-MAX_MESSAGES);
        conversationHistory.set(channelId, trimmed);
        // Persist after update
        try { saveConversations(mapToObject(conversationHistory)); } catch (_) { /* ignore */ }

        // Split long replies to respect Discord limit while preserving code blocks
        const chunks = splitMessagePreservingCodeBlocks(text, 1990);
        for (let i = 0; i < chunks.length; i += 1) {
            if (i > 0) await message.channel.sendTyping();
            // eslint-disable-next-line no-await-in-loop
            await message.channel.send(chunks[i]);
        }
    } catch (error) {
        console.error('DM handler error:', error?.response?.data || error.message);
        try {
            await message.channel.send('Sorry, I encountered an error trying to get a response.');
        } catch (_) {
            // ignore
        }
    }
});

client.login(BOT_TOKEN); 

// Persist conversations on shutdown
const shutdown = () => {
    try { saveConversations(mapToObject(conversationHistory)); } catch (_) { /* ignore */ }
    process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);