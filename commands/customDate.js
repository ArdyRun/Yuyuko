const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const db = require("../firebase/firestore");
const { updateUserStreak } = require("../utils/streak"); 
const { getUserStreakByMedia, getUserStreak } = require("../utils/streak"); 

module.exports = {
  data: new SlashCommandBuilder()
    .setName("customdate")
    .setDescription("Add immersion log for a custom date to restore lost streak")
    .addStringOption(option =>
      option
        .setName("date")
        .setDescription("Date in YYYY-MM-DD format (e.g., 2024-01-15)")
        .setRequired(true))
    .addStringOption(option =>
      option
        .setName("media")
        .setDescription("Type of immersion media")
        .setRequired(true)
        .addChoices(
          { name: "Reading", value: "reading" },
          { name: "Listening", value: "listening" },
          { name: "Visual Novel", value: "visual_novel" },
          { name: "Anime", value: "anime" },
          { name: "Manga", value: "manga" },
          { name: "Book", value: "book" },
          { name: "Reading Time", value: "reading_time" }
        ))
    .addNumberOption(option =>
      option
        .setName("amount")
        .setDescription("Amount (pages, minutes, episodes, characters)")
        .setRequired(true))
    .addStringOption(option =>
      option
        .setName("title")
        .setDescription("Title of media (optional)")
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    const customDate = interaction.options.getString("date");
    const media_type = interaction.options.getString("media");
    const amount = interaction.options.getNumber("amount");
    const title = interaction.options.getString("title") || "-";
    const user = interaction.user;

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(customDate)) {
      return await interaction.editReply({
        content: "❌ Invalid date format. Please use YYYY-MM-DD (e.g., 2024-01-15)."
      });
    }

    // Validate date is not in the future
    const inputDate = new Date(customDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (inputDate > today) {
      return await interaction.editReply({
        content: "❌ Cannot log immersion for future dates."
      });
    }

    // Validate date is not too old (more than 1 year)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    if (inputDate < oneYearAgo) {
      return await interaction.editReply({
        content: "❌ Cannot log immersion for dates older than 1 year."
      });
    }

    const unitMap = {
      visual_novel: "characters",
      manga: "pages", 
      anime: "episodes",
      book: "pages",
      reading_time: "minutes",
      listening: "minutes",
      reading: "characters",
    };

    const labelMap = {
      visual_novel: "Visual Novel",
      manga: "Manga",
      anime: "Anime", 
      book: "Book",
      reading_time: "Reading Time",
      listening: "Listening",
      reading: "Reading",
    };

    const unit = unitMap[media_type];
    const label = labelMap[media_type];
    const dateStr = customDate;
    const localDate = new Date(customDate);
    
    try {
      // Create immersion log entry with custom date
      const logData = {
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName || user.username,
          avatar: user.displayAvatarURL({ size: 64 })
        },
        activity: {
          type: media_type,
          typeLabel: label,
          amount: amount,
          unit: unit,
          title: title,
          comment: "Custom date entry"
        },
        metadata: {
          source: "custom_date"
        },
        timestamps: {
          created: new Date(),
          date: dateStr,
          month: dateStr.slice(0, 7),
          year: localDate.getFullYear()
        }
      };

      // Add log to user's collection
      await db.collection("users").doc(user.id).collection("immersion_logs").add(logData);

      // ===== FIX: Proper stats update with validation =====
      const userStatsRef = db.collection("users").doc(user.id);
      
      // Use transaction to ensure consistency
      await db.runTransaction(async (transaction) => {
        const userStatsDoc = await transaction.get(userStatsRef);
        
        let currentData = {};
        if (userStatsDoc.exists) {
          currentData = userStatsDoc.data() || {};
        }
        
        // Initialize stats object if it doesn't exist
        if (!currentData.stats) {
          currentData.stats = {};
        }
        
        // Initialize specific media type stats if it doesn't exist
        if (!currentData.stats[media_type]) {
          currentData.stats[media_type] = {
            total: 0,
            sessions: 0,
            lastActivity: null,
            bestStreak: 0,
            currentStreak: 0,
            unit: unit,
            label: label
          };
        }
        
        // Safely get current values with fallbacks
        const currentTotal = currentData.stats[media_type].total || 0;
        const currentSessions = currentData.stats[media_type].sessions || 0;
        
        // Calculate new values
        const newTotal = currentTotal + amount;
        const newSessions = currentSessions + 1;
        
        // Update the stats for this media type
        currentData.stats[media_type] = {
          ...currentData.stats[media_type],
          total: newTotal,
          sessions: newSessions,
          lastActivity: new Date(),
          unit: unit,
          label: label
        };
        
        // Update profile info
        if (!currentData.profile) {
          currentData.profile = {};
        }
        
        currentData.profile = {
          ...currentData.profile,
          id: user.id,
          username: user.username,
          displayName: user.displayName || user.username,
          avatar: user.displayAvatarURL({ size: 64 }),
          lastSeen: new Date()
        };
        
        // Update summary
        if (!currentData.summary) {
          currentData.summary = {};
        }
        
        const totalSessions = Object.values(currentData.stats).reduce((sum, stat) => {
          return sum + (stat.sessions || 0);
        }, 0);
        
        currentData.summary = {
          ...currentData.summary,
          totalSessions: totalSessions,
          lastActivity: new Date(),
          joinDate: currentData.summary?.joinDate || new Date(),
          activeTypes: Object.keys(currentData.stats)
        };
        
        // Update timestamps
        currentData.timestamps = {
          updated: new Date(),
          lastLog: new Date()
        };
        
        // Write the updated data
        transaction.set(userStatsRef, currentData, { merge: true });
        
        // Store newTotal for display
        currentData._newTotal = newTotal;
      });

      // Update streaks after successful database update
      await updateUserStreak(user.id);
      const { streak: globalStreak } = await getUserStreak(user.id);
      const { streak: mediaStreak, longest: mediaLongest } = await getUserStreakByMedia(user.id, media_type);

      // Update streak info in database
      await userStatsRef.update({
        [`stats.${media_type}.currentStreak`]: mediaStreak || 0,
        [`stats.${media_type}.bestStreak`]: mediaLongest || 0
      });

      // Get the updated total for display
      const finalDoc = await userStatsRef.get();
      const finalData = finalDoc.data();
      const updatedTotal = finalData?.stats?.[media_type]?.total || amount;

      // Create embed - MATCHING IMMERSION COMMAND STRUCTURE
      let titleText = `${label} Logged`;
      let description = title && title !== "-" ? `**${title}**` : null;
      
      const fields = [];
      
      fields.push(
        { name: `Progress`, value: `+${amount} ${unit}`, inline: true },
        { name: `Total`, value: `${updatedTotal.toLocaleString()} ${unit}`, inline: true },
        { name: `Streak`, value: `${globalStreak || 0} day${(globalStreak || 0) === 1 ? '' : 's'}`, inline: true }
      );

      if (title && title !== "-") {
        fields.push({ name: "Comment", value: "Custom date entry", inline: false });
      }

      const embed = new EmbedBuilder()
        .setColor(0x00d4aa)
        .setTitle(titleText)
        .setDescription(description)
        .addFields(...fields)
        .setTimestamp()
        .setFooter({ 
          text: `${user.username} • ${label}`, 
          iconURL: user.displayAvatarURL({ size: 32 }) 
        });

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error("Error in customdate command:", err);
      await interaction.editReply({ content: "❌ Failed to add log. Error: " + err.message });
    }
  }
};