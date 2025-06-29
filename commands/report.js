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
        
      // --- NEW, SIMPLER SYSTEM PROMPT ---
      // This prompt focuses on scraping and organizing, not analysis.
      const systemPrompt = `You are a data scraping bot for a Discord server. Your ONLY task is to read a chat log and extract and organize any message that states a clear trading action. Do not analyze, assess, or judge the plays.

A valid trade to be logged MUST contain these two elements:
1.  **Ticker Symbol:** e.g., SPY, AAPL, TSLA.
2.  **Direction/Action:** A clear action like 'buying calls', 'selling puts', 'going long', 'shorting', 'in puts', 'grabbed calls'.

The 'why' or 'thesis' is NOT required.

**IMPORTANT CONTEXT RULE:** Messages from the same author sent close together in time should be treated as a single, connected thought. You can find the Ticker and Direction across a few of their messages.
* Example 1: "the_real_sammy: going long on LMT here" -> This IS a valid play.
* Example 2: "boots0: IN SPX PUTS" -> This IS a valid play.
* Example 3: "boots0: probably targeting 400" -> This IS NOT a valid play by itself, but should be included as context if the Ticker/Direction was mentioned just before.

If you find one or more valid plays, format them neatly into a simple list for logging purposes. If you find no messages that contain both a Ticker and a Direction, you must respond with only the single word 'NONE'.`;
      
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