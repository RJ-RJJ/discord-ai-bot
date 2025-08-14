const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const { formatForDiscord, splitMessagePreservingCodeBlocks } = require('../utils/formatting');
const { SYSTEM_PROMPT } = require('../utils/prompt');
const { callChatCompletion, callChatCompletionStream } = require('../utils/api');
const { createWarningEmbed, createErrorEmbed } = require('../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Ask the AI a question')
        .setDMPermission(true)
        .addStringOption(option =>
            option.setName('question')
                .setDescription('The question you want to ask')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('dm')
                .setDescription('Send the reply via DM (private)')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('stream')
                .setDescription('Stream the response in realtime')
                .setRequired(false)
        ),
    async execute(interaction, provider, conversationHistory) {
        await interaction.deferReply();
        const question = interaction.options.getString('question');
        const sendInDm = interaction.options.getBoolean('dm') ?? false;
        const useStream = interaction.options.getBoolean('stream') ?? true;

        try {
            const channelId = interaction.channel.id;
            const history = conversationHistory.get(channelId) || [];

            // Convert stored history (assistant/user) into OpenAI/OpenRouter format
            const messages = history.map(m => ({ role: m.role, content: m.content }))
                .concat([{ role: 'user', content: question }]);

            let raw;
            if (useStream && !sendInDm) {
                // Streaming mode: incrementally edit the reply
                let buffer = '';
                let lastEdit = 0;
                const throttleMs = 400;
                await callChatCompletionStream({
                    baseUrl: provider.baseUrl || 'https://api.groq.com/openai/v1',
                    apiKey: provider.apiKey,
                    model: provider.model,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        ...messages,
                    ],
                    timeoutMs: 60000,
                    onDelta: async (delta) => {
                        buffer += delta;
                        const now = Date.now();
                        if (buffer.length <= 1900 && (now - lastEdit > throttleMs || delta.includes('\n'))) {
                            lastEdit = now;
                            try {
                                await interaction.editReply(formatForDiscord(buffer));
                            } catch (_) { /* ignore */ }
                        }
                    },
                }).then((full) => { raw = full; });
            } else {
                // Non-streaming (also used for DM)
                let warned = false;
                raw = await callChatCompletion({
                    baseUrl: provider.baseUrl || 'https://api.groq.com/openai/v1',
                    apiKey: provider.apiKey,
                    model: provider.model,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        ...messages,
                    ],
                    timeoutMs: 60000,
                    maxRetries: 3,
                    onRetry: async (attempt) => {
                        if (!interaction.inGuild()) return; // DM: keep quiet
                        if (warned) return;
                        warned = true;
                        const embed = createWarningEmbed(
                            `The AI service is busy (retrying, attempt ${attempt + 1}). This may take a few seconds...`,
                            { title: 'Please wait' }
                        );
                        try {
                            await interaction.followUp({ embeds: [embed], ephemeral: true });
                        } catch (_) { /* ignore */ }
                    },
                    onGiveUp: async () => {
                        if (!interaction.replied && !interaction.deferred) return;
                        const embed = createErrorEmbed('Failed to get a response from the AI service. Please try again later.', { title: 'Service Unavailable' });
                        try {
                            await interaction.followUp({ embeds: [embed], ephemeral: true });
                        } catch (_) { /* ignore */ }
                    }
                });
            }
            const formatted = formatForDiscord(raw);

            history.push({ role: 'user', content: question });
            // Store raw text in history to avoid compounding formatting transforms
            history.push({ role: 'assistant', content: raw });

            // Cap history to last 20 messages to avoid unbounded growth
            const MAX_MESSAGES = 20;
            const trimmed = history.slice(-MAX_MESSAGES);
            conversationHistory.set(channelId, trimmed);

            const chunks = splitMessagePreservingCodeBlocks(formatted, 1990);

            if (sendInDm && interaction.inGuild()) {
                const dm = await interaction.user.createDM();
                for (let i = 0; i < chunks.length; i += 1) {
                    // eslint-disable-next-line no-await-in-loop
                    await dm.send(chunks[i]);
                }
                await interaction.editReply({ content: 'Sent the reply to your DMs.', ephemeral: true });
            } else {
                // First chunk edits the reply, rest are followups
                await interaction.editReply(chunks[0]);
                for (let i = 1; i < chunks.length; i += 1) {
                    // eslint-disable-next-line no-await-in-loop
                    await interaction.followUp(chunks[i]);
                }
            }
        } catch (error) {
            console.error('Error calling Groq API:', error?.response?.data || error.message);
            await interaction.editReply('Sorry, I encountered an error trying to get a response.');
        }
    },
}; 