const { SlashCommandBuilder } = require('discord.js');
const { saveConversations, mapToObject } = require('../utils/storage');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Start a new chat (clears previous context)')
        .setDMPermission(true),
    async execute(interaction, _openrouter, conversationHistory) {
        const channelId = interaction.channel?.id || interaction.user.id;
        const existed = conversationHistory.has(channelId);
        conversationHistory.delete(channelId);
        try { saveConversations(mapToObject(conversationHistory)); } catch (_) { /* ignore */ }
        await interaction.reply({
            content: existed ? 'New chat started. Previous context cleared.' : 'New chat started.',
            ephemeral: interaction.inGuild(),
        });
    },
}; 