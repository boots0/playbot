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
        
      const logBuffer = Buffer.from(chatLog, 'utf-8');
      
      await interaction.followUp({
        content: '🕵️ Here is the exact chat log being sent to the AI for analysis. Please review it.',
        files: [{ attachment: logBuffer, name: 'chatlog-to-ai.txt' }],
        ephemeral: true
      });

      // --- NEW: Improved System Prompt ---
      const systemPrompt = `You are a financial analyst bot for a Discord server. Your task is to identify potential stock or option plays from a chat log based on a strict set of criteria.

A valid play MUST contain these three elements:
1.  **Ticker Symbol:** e.g., SPY, AAPL, TSLA.
2.  **Direction/Action:** A clear action like 'buying calls', 'selling puts', 'going long', 'shorting', or 'opening a position'.
3.  **Thesis/Reason:** The 'why' behind the trade, such as a technical indicator, a news event, or a specific price target.

**Good Example (You MUST identify this):** "I'm buying NVDA $130 calls here. The chart just broke out of a bull flag and I think it runs to $135."
**Bad Example (You MUST ignore this):** "Wow TSLA is moving a lot today!" or "Anyone watching SPY?" or "I sold my SPY calls" (this is a closed trade, not a new play).

If you find one or more valid plays, format them neatly into a summary post with sections for each play. If you find no messages that meet all three criteria, you must respond with only the single word 'NONE'.`;
      
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

      // --- NEW DEBUGGING STEP ---
      // This will show you the AI's exact response before the bot acts on it.
      await interaction.followUp({
        content: `🕵️ **AI's Raw Response:**\n\`\`\`\n${aiResponse}\n\`\`\``,
        ephemeral: true
      });
      // --- END NEW DEBUGGING STEP ---

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