require("dotenv").config();
const { App, ExpressReceiver } = require("@slack/bolt");
const { createClient } = require("@supabase/supabase-js");
const { getWaterTemperature } = require("./services/temperatureService");
const {
  getScoreForUser,
  getAverageTempForUser,
} = require("./services/supabaseService");
const getWeek = require("date-fns/getWeek");
const nb = require("date-fns/locale/nb");
const { format, utcToZonedTime } = require("date-fns-tz");

const DEFAULT_TIMEZONE = "Europe/Oslo";
const DEFAULT_LOCATION_ID = 2; //marineholmen

const supabaseClient = createClient(
  process.env.API_URL,
  process.env.PUBLIC_KEY
);

const PORT = process.env.PORT || 3000;

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
});

// A more generic, global error handler
app.error((error) => {
  // Check the details of the error to handle cases where you should retry sending a message or stop the app
  console.error(error);
});

(async () => {
  await app.start(PORT);
  console.log(`Running on port: ${PORT}`);
})();

receiver.router.post("/slack/events", (req, res) => {
  if (req?.body?.challenge) res.send({ challenge });
});

app.command("/badet", async ({ ack, say, command, client }) => {
  await ack();

  if (!command.text.includes("@")) {
    await say(
      `<@${command.user_name}> Du må tagge den du har badet med for å registrere badet`
    );
    return;
  }

  const { channel_id, user_id } = command;

  const usernames = command.text
    .split(" ")
    .filter((user) => user.includes("@"))
    .map((user) => user.replace("@", ""));

  //TODO
  // const response = await client.chat.postEphemeral({
  //   token: process.env.SLACK_BOT_TOKEN,
  //   channel: channel_id,
  //   user: user_id,
  //   blocks: [
  //     {
  //       type: "section",
  //       text: {
  //         type: "mrkdwn",
  //         text: "Du har registrert et bad med @francis. Er du sikker på dette?"
  //       }
  //     },
  //     {
  //       type: "actions",
  //       elements: [
  //         {
  //           type: "button",
  //           text: {
  //             type: "plain_text",
  //             emoji: true,
  //             text: "Ja"
  //           },
  //           style: "primary",
  //           value: "yes"
  //         },
  //         {
  //           type: "button",
  //           text: {
  //             type: "plain_text",
  //             emoji: true,
  //             text: "Nei"
  //           },
  //           style: "danger",
  //           value: "no",
  //         }
  //       ]
  //     }
  //   ]
  // });

  // console.log("response = ", response)

  let registerString = `<@${command.user_name}> har registrert et bad med `;

  usernames.forEach((username) => {
    registerString += `<@${username}> `;
  });
  await say(registerString);

  usernames.push(command.user_name);

  const uniqueUsernames = [...new Set(usernames)];

  const { data: users, error } = await supabaseClient
    .from("users")
    .select("*")
    .in("slack_username", uniqueUsernames);

  const missingUsers = uniqueUsernames.filter(
    (x) => !users.map((x) => x.slack_username).includes(x)
  );
  missingUsers.forEach(async (username) => {
    await say(
      `<@${username}> er ikke registrert i databasen. Du må registrere deg før du kan registrere bad.`
    );
  });

  if (users.length > 0) {
    users.forEach(async (user) => {
      const { data: baths, error } = await supabaseClient
        .from("baths")
        .select("created_at")
        .eq("user_slack_id", user.slack_id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (baths.length > 0) {
        const lastBath = baths[0];
        const bathDate = new Date(lastBath.created_at);
        const hasBadetThisWeek =
          getWeek(bathDate, {
            weekStartsOn: 1,
          }) ===
          getWeek(new Date(), {
            weekStartsOn: 1,
          });
        if (hasBadetThisWeek) {
          await say(
            `<@${user.slack_id}> har allerede badet denne uken. Du kan ikke få poeng igjen før neste uke.`
          );
          return;
        } else {
          const temperatureLocation = await getWaterTemperature(
            DEFAULT_LOCATION_ID
          );
          const { data: bath, error } = await supabaseClient
            .from("baths")
            .insert([
              {
                user_slack_id: user.slack_id,
                temperature: temperatureLocation.temperature ?? null,
              },
            ]);
          if (bath) {
            const { count } = await supabaseClient
              .from("baths")
              .select("*", { count: "exact" })
              .eq("user_slack_id", user.slack_id);
            await say(
              `<@${user.slack_id}> har fått 1 poeng for badet sitt. Du har nå ${count} poeng. :100:`
            );
          }
        }
      } else {
        const temperatureLocation = await getWaterTemperature(
          DEFAULT_LOCATION_ID
        );
        const { data: bath, error } = await supabaseClient
          .from("baths")
          .insert([
            {
              user_slack_id: user.slack_id,
              temperature: temperatureLocation.temperature ?? null,
            },
          ]);
        if (bath) {
          const count = await getScoreForUser(user.slack_id);
          await say(
            `<@${user.slack_id}> har fått 1 poeng for badet sitt. Du har nå ${count} poeng. :100:`
          );
        }
      }
    });
  }
});

app.command(`/score`, async ({ ack, say, command, client }) => {
  await ack();
  const count = await getScoreForUser(command.user_id);
  await say(
    `<@${command.user_id}> har badet ${count} ganger :man-tipping-hand:`
  );
});

app.command(`/scoreboard`, async ({ ack, say, command }) => {
  await ack();
  //count baths for all users in users
  const { data: users, error } = await supabaseClient.from("users").select("*");
  const scoreboard = await Promise.all(
    users.map(async (user) => {
      const count = await getScoreForUser(user.slack_id);
      return {
        name: user.slack_username,
        count,
      };
    })
  );
  //sort scoreboard by count desc and say scoreboard
  const sortedScoreboard = scoreboard.sort((a, b) => b.count - a.count);
  let scoreboardString = "SCOREBOARD: :goggles:\n";
  sortedScoreboard.forEach((user) => {
    scoreboardString += `${user.name}: ${user.count} \n`;
  });
  await say(scoreboardString);
});

app.command(`/info`, async ({ ack, say, command, client }) => {
  await ack();
  const { channel_id, user_id } = command;

  client.chat.postEphemeral({
    token: process.env.SLACK_BOT_TOKEN,
    channel: channel_id,
    user: user_id,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `<#${channel_id}> er et engasjement som har fokus på personlig helse og å sosialisere seg med kollegaer i Stacc :stacc:. Konseptet går ut på å bade hver uke sammen med dine kollegaer.`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Reglene er enkle:*\n• Man kan maks få 1 poeng per uke :one:\n• Man er nødt til å bade sammen med én eller flere kollegaer :people_holding_hands:",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Skriv `/help` for å se en liste over kommandoer",
        },
      },
    ],
  });
});

app.command(`/help`, async ({ ack, say, client, command }) => {
  await ack();
  const { channel_id, user_id } = command;

  client.chat.postEphemeral({
    token: process.env.SLACK_BOT_TOKEN,
    channel: channel_id,
    user: user_id,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Kommandoer: :information_source:*\n• `/info` - Info om konseptet (kun synlig for deg)\n• `/register` - Registrerer brukeren din i databasen\n• `/badet @<dine-badebuddier>` - Registrerer et bad for deg og de du har badet med. Dette kan kun gjøres én gang per uke\n• `/score` - Viser hvor mange ganger du har badet \n• `/scoreboard` - Viser scoreboard over hvor mange ganger alle har badet\n• `/temperature` - Viser siste temperaturmåling i vannet på Marineholmen",
        },
      },
    ],
  });
});

app.command(`/register`, async ({ ack, say, command }) => {
  await ack();
  const { user_id, user_name, channel_id } = command;
  const { data: users } = await supabaseClient
    .from("users")
    .select("slack_id")
    .eq("slack_id", user_id);
  if (users.length === 0) {
    await supabaseClient
      .from("users")
      .insert([{ slack_id: user_id, slack_username: user_name }]);
    await say({
      attachments: [
        {
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `Hei <@${user_id}> og velkommen til <#${channel_id}> :swimmer:!\nSkriv \`/info\` for å lese mer om konseptet.`,
              },
            },
          ],
          fallback: `Hei <@${user_id}> og velkommen til <#${channel_id}>:swimmer:! Skriv /info for å lese mer om konseptet.`,
        },
      ],
    });
  }
});

app.command("/temperature", async ({ ack, say, command }) => {
  await ack();
  const { user_id } = command;
  const location = await getWaterTemperature(DEFAULT_LOCATION_ID);
  const date = formatDate(location?.time);

  const temperature = Number(location.temperature);
  const emoji = getTemperatureEmoji(temperature);
  await say(
    `Temperatur forespurt av <@${user_id}>\nSted: ${location.location_name}\nTemperatur: ${location.temperature}\u00B0C ${emoji}\nTidspunkt: ${date}`
  );
});

app.command(`/averagetemp`, async ({ ack, say, command }) => {
  await ack();
  //count baths for all users in users
  const { data: users, error } = await supabaseClient.from("users").select("*");
  const scoreboard = await Promise.all(
    users.map(async (user) => {
      const temp = await getAverageTempForUser(user.slack_id);
      const count = await getScoreForUser(user.slack_id);
      return {
        name: user.slack_username,
        temp,
        count,
      };
    })
  );
  //sort scoreboard by temp asc and say scoreboard
  const sortedScoreboard = scoreboard.sort((a, b) => a.temp - b.temp);
  let scoreboardString = "AVERAGE TEMPERATURES: :thermometer:\n";
  sortedScoreboard.forEach((user) => {
    scoreboardString += `${user.name}: ${user.temp} (${user.count} bad)\n`;
  });
  await say(scoreboardString);
});

function getTemperatureEmoji(temperature) {
  if (temperature < 5) {
    return ":cold_face:";
  } else if (temperature < 10) {
    return ":hot_face:";
  } else if (temperature < 15) {
    return ":thermometer:";
  } else {
    return ":fire:";
  }
}

const formatDate = (dateTimeString, timeZone = DEFAULT_TIMEZONE) => {
  const date = new Date(dateTimeString);
  const zonedDate = utcToZonedTime(date, timeZone);
  return format(zonedDate, "PPPp", { locale: nb });
};

module.exports = app;
