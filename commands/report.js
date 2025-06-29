const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Scrapes recent chat for plays and organizes them into a summary.'),

  async execute(interaction) {
    // CHANGED: Defer reply ephemerally (privately) so the final confirmation is hidden.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (interaction.user.id !== process.env.ADMIN_USER_ID) {
      return interaction.editReply({ content: '❌ You do not have permission to use this command.' });
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
        
      const systemPrompt = `You are a data scraping bot for a Discord server. Your only task is to read a chat log and extract specific, detailed information about trading actions. Do not analyze or judge the plays. The goal is to create a detailed log that someone could use to understand the trade.

A logged play MUST contain:
1.  **ticker:** The stock ticker.
2.  **direction:** The action taken.

In addition, you MUST ALSO find and include these OPTIONAL details if they are mentioned:
* **strike:** The strike price of an option (e.g., the "455" in "455 puts").
* **premium:** The entry price paid (e.g., the "1.25" in "@ 1.25").
* **target:** The price target for the trade (e.g., the "400" in "targeting 400").

**CRITICAL CONTEXT RULE:** You must connect details from messages sent by the same author close together. A user might state the Ticker/Direction in one message and the Target/Price in the next. Combine them into a single, detailed log entry.

**Example of your required output format:**
[
  {
    "ticker": "LMT",
    "direction": "Grabbed puts",
    "strike": "455",
    "premium": "1.25",
    "target": "400"
  },
  {
    "ticker": "SPX",
    "direction": "In puts",
    "strike": null,
    "premium": null,
    "target": null
  }
]

If you find no valid plays, you MUST respond with an empty JSON array: []`;
      
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: chatLog }
        ],
        response_format: { type: "json_object" }
      }, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
      });
      
      const aiResponseString = response.data.choices[0].message.content;

      let plays = [];
      try {
        const cleanedJsonString = aiResponseString.replace(/```json\n|```/g, '');
        plays = JSON.parse(cleanedJsonString);
      } catch (e) {
        console.error("Failed to parse JSON from AI:", aiResponseString);
        return interaction.editReply('❌ The AI returned an invalid response. Please try again.');
      }

      if (!plays || plays.length === 0) {
        return interaction.editReply('✅ Analysis complete. No new plays were found that met the criteria.');
      }

      const outputChannel = await interaction.client.channels.fetch(OUTPUT_CHANNEL_ID);
      
      const reportEmbed = new EmbedBuilder()
        .setTitle('Recent Trade Log')
        .setColor('#0099ff')
        .setTimestamp()
        .setFooter({ text: 'Scraped from #chat activity' });

      for (const play of plays) {
        let fieldValue = `**Action:** ${play.direction}`;
        if (play.strike) fieldValue += `\n**Strike:** ${play.strike}`;
        if (play.premium) fieldValue += `\n**Premium:** ${play.premium}`;
        if (play.target) fieldValue += `\n**Target:** ${play.target}`;

        reportEmbed.addFields({ 
          name: `📈 ${play.ticker.toUpperCase()}`, 
          value: fieldValue,
          inline: true
        });
      }

      await outputChannel.send({ embeds: [reportEmbed] });

      return interaction.editReply(`✅ Trade log generated and posted to <#${OUTPUT_CHANNEL_ID}>.`);

    } catch (error) {
      console.error('Error with /report command:', error.response ? error.response.data : error.message);
      return interaction.editReply('❌ An error occurred. Check the bot logs for details.');
    }
  },
};