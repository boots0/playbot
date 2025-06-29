const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Scrapes recent chat for plays and organizes them into a summary.'),

  async execute(interaction) {
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
        
      const systemPrompt = `You are a data scraping bot. Your ONLY task is to read a chat log and extract trade information into a structured JSON format.

A logged play MUST contain:
1.  **ticker:** The stock ticker.
2.  **direction:** The action taken.

Also include these optional keys if found: 'strike', 'premium', 'target'. If an optional detail is not found, its value should be null.

**CRITICAL:** Your entire response MUST be a single, valid JSON array of objects. Do NOT include any text, explanations, or markdown before or after the JSON array.

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

      // --- NEW: Robust JSON parsing and validation ---
      let parsedData;
      try {
        const cleanedJsonString = aiResponseString.replace(/```json\n|```/g, '');
        parsedData = JSON.parse(cleanedJsonString);
      } catch (e) {
        console.error("Failed to parse JSON from AI:", aiResponseString);
        return interaction.editReply('❌ The AI returned an invalid response. Please try again.');
      }

      // Check if the AI returned a single object and wrap it in an array if it did.
      const plays = Array.isArray(parsedData) ? parsedData : [parsedData];
      // --- END NEW SECTION ---

      if (!plays || plays.length === 0 || plays[0] === null) {
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
      console.error('Error with /report command:', error);
      return interaction.editReply('❌ An error occurred. Check the bot logs for details.');
    }
  },
};