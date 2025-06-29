const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Analyzes recent chat for plays and generates an AI summary.'),

  async execute(interaction) {
    await interaction.deferReply();

    if (interaction.user.id !== process.env.ADMIN_USER_ID) {
      return interaction.editReply({ content: '❌ You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    }

    const { SOURCE_CHANNEL_ID, OUTPUT_CHANNEL_ID, OPENAI_API_KEY, ADMIN_USER_ID } = process.env;

    if (!SOURCE_CHANNEL_ID || !OUTPUT_CHANNEL_ID || !OPENAI_API_KEY || !ADMIN_USER_ID) {
      return interaction.editReply({ content: '❌ Bot is not fully configured. Missing channel IDs, OpenAI key, or Admin User ID.' });
    }

    try {
      const sourceChannel = await interaction.client.channels.fetch(SOURCE_CHANNEL_ID);
      const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
      
      const messages = await sourceChannel.messages.fetch({ limit: 100 });
      const recentMessages = messages.filter(m => m.createdTimestamp > sixHoursAgo);

      if (recentMessages.size === 0) {
        return interaction.editReply({ content: 'ℹ️ Analysis complete. No messages found in the last 6 hours.' });
      }
      
      const chatLog = recentMessages
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map(m => `${m.author.tag}: ${m.content}`)
        .join('\n');
        
      // --- NEW DEBUGGING STEP ---
      // Create a buffer from the chat log string to send as a file
      const logBuffer = Buffer.from(chatLog, 'utf-8');
      
      // Send the log as a text file for you to review.
      // We use followUp because we already deferred the reply.
      await interaction.followUp({
        content: '🕵️ Here is the exact chat log being sent to the AI for analysis. Please review it.',
        files: [{ attachment: logBuffer, name: 'chatlog-to-ai.txt' }],
        ephemeral: true // This message with the file will only be visible to you
      });
      // --- END NEW DEBUGGING STEP ---

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
      return interaction.editReply('❌ An error occurred. Check the bot logs for details.');
    }
  },
};