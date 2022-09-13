require("dotenv").config();
const { App, ExpressReceiver } = require("@slack/bolt");

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

app.message(`badet med`, async (data) => {
  console.log(data.event);
  await data.say(`<@${data.message.user}> har badet!`);
});
