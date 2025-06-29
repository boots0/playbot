const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
  // The data portion is now simpler, as the permission check is manual
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Analyzes recent chat for plays and generates an AI summary.'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // --- NEW: User Permission Check ---
    // Check if the user running the command is the authorized admin
    if (interaction.user.id !== process.env.ADMIN_USER_ID) {
      return interaction.editReply({ content: '❌ You do not have permission to use this command.' });
    }
    // --- END NEW SECTION ---

    // 1. Get configuration from environment variables
    const { SOURCE_CHANNEL_ID, OUTPUT_CHANNEL_ID, OPENAI_API_KEY } = process.env;

    if (!SOURCE_CHANNEL_ID || !OUTPUT_CHANNEL_ID || !OPENAI_API_KEY || !process.env.ADMIN_USER_ID) {
      return interaction.editReply('❌ Bot is not fully configured. Missing channel IDs, OpenAI key, or Admin User ID.');
    }

    try {
      // 2. Fetch the last 6 hours of messages...
      // (The rest of the file is the same as before)
      const sourceChannel = await interaction.client.channels.fetch(SOURCE_CHANNEL_ID);
      const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
      
      let allMessages = [];
      let lastId;

      while (true) {
        const options = { limit: 100 };
        if (lastId) {
          options.before = lastId;
        }
        const messages = await sourceChannel.messages.fetch(options);
        const recentMessages = messages.filter(m => m.createdTimestamp > sixHoursAgo);
        allMessages.push(...recentMessages.values());
        
        lastId = messages.last().id;

        if (messages.size !== 100 || messages.last().createdTimestamp < sixHoursAgo) {
          break;
        }
      }

      if (allMessages.length === 0) {
        return interaction.editReply('ℹ️ No messages found in the last 6 hours.');
      }

      const chatLog = allMessages
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map(m => `${m.author.tag}: ${m.content}`)
        .join('\n');

      const systemPrompt = `You are a financial analyst bot for a Discord server. Your task is to read a provided chat log and identify any potential stock or option plays. A play consists of a ticker symbol, a direction (e.g., calls, puts, buy, sell), and a reason or thesis. If you find one or more plays, format them neatly into a summary post with sections for each play. If you find no credible plays mentioned, you must respond with only the single word 'NONE'.`;
      
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: chatLog }
        ],
      }, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
      });
      
      const aiResponse = response.data.choices[0].message.content;

      if (aiResponse.trim().toUpperCase() === 'NONE') {
        return interaction.editReply('✅ Analysis complete. No new plays were found in the chat log.');
      }

      const outputChannel = await interaction.client.channels.fetch(OUTPUT_CHANNEL_ID);
      const reportEmbed = new EmbedBuilder()
        .setTitle('Recent Plays Summary')
        .setDescription(aiResponse)
        .setColor('#0099ff')
        .setTimestamp()
        .setFooter({ text: 'Generated from #chat activity' });

      await outputChannel.send({ embeds: [reportEmbed] });

      return interaction.editReply(`✅ Report generated and posted to <#${OUTPUT_CHANNEL_ID}>.`);

    } catch (error) {
      console.error('Error with /report command:', error.response ? error.response.data : error.message);
      return interaction.editReply('❌ An error occurred. Check the bot logs. It might be an invalid API key or a problem reaching OpenAI.');
    }
  },
};