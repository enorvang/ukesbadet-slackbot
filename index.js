require("dotenv").config();
const { App, ExpressReceiver } = require("@slack/bolt");
const { createClient } = require("@supabase/supabase-js");

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

(async () => {
  await app.start(PORT);
  console.log(`Running on port: ${PORT}`);
})();

receiver.router.post("/slack/events", (req, res) => {
  if (req?.body?.challenge) res.send({ challenge });
});

receiver.router.post("/interactive", (req, res) => {
  console.log(req);
});

app.command("/badet", async ({ command, ack, respond }) => {
  // Acknowledge command request
  await ack();
  console.log(command);
  await say(`${command.text}`);
});

app.message(`score`, async (data) => {
  const { count } = await supabaseClient
    .from("baths")
    .select("*", { count: "exact" })
    .eq("user_slack_id", data.message.user);

  await data.say(`<@${data.message.user}> har badet ${count} ganger`);
});

app.event("member_joined_channel", async (data) => {
  const { user, channel } = data.event;
  const { data: users } = await supabaseClient
    .from("users")
    .select("slack_id")
    .eq("slack_id", user);
  if (users.length === 0) {
    await supabaseClient.from("users").insert([{ slack_id: user }]);
  }
  await data.say(
    `Hei <@${user}>! Velkommen til <#${channel}>! For å få poeng må du skrive badet i kanalen.`
  );
});

app.message(`badet`, async (data) => {
  await supabaseClient
    .from("baths")
    .insert([{ user_slack_id: data.message.user }]);

  const { count } = await supabaseClient
    .from("baths")
    .select("*", { count: "exact" })
    .eq("user_slack_id", data.message.user);

  // const test = await supabaseClient
  //   .rpc("increment", {
  //     row_id: data.message.user,
  //   })
  // console.log(test);

  await data.say(`<@${data.message.user}> har nå badet ${count} ganger`);
});
