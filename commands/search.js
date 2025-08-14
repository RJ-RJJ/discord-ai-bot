'use strict';

const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const { SYSTEM_PROMPT } = require('../utils/prompt');
const { splitMessagePreservingCodeBlocks, formatForDiscord } = require('../utils/formatting');
const { callChatCompletion } = require('../utils/api');
const { getCachedSearch, setCachedSearch } = require('../utils/searchCache');
const { isAllowed } = require('../utils/rateLimit');

/**
 * Very small Tavily client wrapper.
 */
async function tavilySearch(apiKey, query, { maxResults = 3, depth = 'basic' } = {}) {
  const url = 'https://api.tavily.com/search';
  const res = await axios.post(url, {
    api_key: apiKey,
    query,
    include_domains: [],
    max_results: maxResults,
    search_depth: depth,
    include_answer: true,
    include_images: false,
    include_raw_content: false,
    days: 365,
  }, {
    timeout: 20000,
  });
  return res.data;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Web search + summarize with the model')
    .setDMPermission(true)
    .addStringOption(option =>
      option.setName('query')
        .setDescription('What to search on the web')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('max')
        .setDescription('Max results (default 3, max 10)')
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false)
    ),

  async execute(interaction, provider, conversationHistory) {
    await interaction.deferReply();
    const query = interaction.options.getString('query');
    const max = interaction.options.getInteger('max') ?? 3;
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (!tavilyKey) {
      await interaction.editReply('TAVILY_API_KEY is not configured in `.env`.');
      return;
    }

    // Rate limiting per user
    const userId = interaction.user.id;
    if (!isAllowed(userId)) {
      await interaction.editReply('Rate limit reached. Please try again later.');
      return;
    }

    try {
      // Cache first
      const cached = getCachedSearch(query);
      let search;
      if (cached) {
        search = cached;
      } else {
        search = await tavilySearch(tavilyKey, query, { maxResults: max, depth: 'basic' });
        setCachedSearch(query, search);
      }

      const bullets = [];
      if (Array.isArray(search.results)) {
        for (const r of search.results.slice(0, max)) {
          bullets.push(`- Title: ${r.title || 'Untitled'}`);
          if (r.url) bullets.push(`  - URL: ${r.url}`);
          if (r.content) bullets.push(`  - Snippet: ${r.content.slice(0, 400)}${r.content.length > 400 ? '…' : ''}`);
        }
      }

      const modelPrompt = [
        'You can browse the web via provided results. Produce a short, source-grounded answer.',
        '',
        '**Guidelines**',
        '- Cite sources by listing URLs at the end as bullets.',
        '- If info conflicts, note the disagreement briefly.',
        '- If results are weak, say so and suggest better query terms.',
      ].join('\n');

      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: modelPrompt },
        { role: 'user', content: `Query: ${query}\n\nResults:\n${bullets.join('\n')}` },
      ];

      const raw = await callChatCompletion({
        baseUrl: provider.baseUrl || 'https://api.groq.com/openai/v1',
        apiKey: provider.apiKey,
        model: provider.model,
        messages,
        timeoutMs: 60000,
        maxRetries: 2,
      });
      const formatted = formatForDiscord(raw);
      const chunks = splitMessagePreservingCodeBlocks(formatted, 1990);

      await interaction.editReply(chunks[0] || 'No answer');
      for (let i = 1; i < chunks.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await interaction.followUp(chunks[i]);
      }
    } catch (err) {
      console.error('search error:', err?.response?.data || err.message);
      await interaction.editReply('Search failed. Please try again later.');
    }
  },
};


