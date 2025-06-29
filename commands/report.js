const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Scrapes recent chat for plays and organizes them into a summary.'),

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
        
      // --- NEW: Final prompt enhanced for specific details ---
      const systemPrompt = `You are a data scraping bot for a Discord server. Your only task is to read a chat log and extract specific, detailed information about trading actions. Do not analyze or judge the plays. The goal is to create a detailed log that someone could use to understand the trade.

A logged play MUST contain:
1.  **Ticker Symbol:** e.g., SPY, AAPL.
2.  **Direction/Action:** e.g., 'buying calls', 'selling puts', 'long', 'short'.

In addition, you MUST ALSO find and include these OPTIONAL details if they are mentioned:
* **Strike Price:** The strike price of an option (e.g., the "455" in "455 puts").
* **Premium/Price:** The entry price paid (e.g., the "1.25" in "@ 1.25").
* **Target Price:** The price target for the trade (e.g., the "400" in "targeting 400").

**CRITICAL CONTEXT RULE:** You must connect details from messages sent by the same author close together. A user might state the Ticker/Direction in one message and the Target/Price in the next. Combine them into a single, detailed log entry.

**Example from a real chat log:**
* Chat: "boots0: grabbed LMT puts again at 455 @ 1.25"
* Chat: "boots0: probably targeting 400"
* Your Formatted Output for this should be: "Ticker: LMT, Direction: Grabbed puts, Strike: 455, Premium: 1.25, Target: 400"

Format each discovered play on a new line. If you find no messages containing at least a Ticker and a Direction, respond with the single word 'NONE'.`;
      
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
        return interaction.editReply('✅ Analysis complete. No new plays were found that met the criteria.');
      }

      const outputChannel = await interaction.client.channels.fetch(OUTPUT_CHANNEL_ID);
      const reportEmbed = new EmbedBuilder()
        .setTitle('Recent Trade Log')
        .setDescription(aiResponse)
        .setColor('#0099ff')
        .setTimestamp()
        .setFooter({ text: 'Scraped from #chat activity' });

      await outputChannel.send({ embeds: [reportEmbed] });

      return interaction.editReply(`✅ Trade log generated and posted to <#${OUTPUT_CHANNEL_ID}>.`);

    } catch (error) {
      console.error('Error with /report command:', error.response ? error.response.data : error.message);
      return interaction.editReply('❌ An error occurred. Check the bot logs for details.');
    }
  },
};